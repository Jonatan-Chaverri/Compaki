// Order settlement shared by both payment paths:
//
//   - custodial buyers: the API signs every item's purchase in one request;
//   - Cavos buyers: the API prepares one item's purchase at a time, the buyer
//     signs it in the browser, and POST /api/tx/:id submits it and comes back
//     here for the next item (completePurchaseStep).
//
// Either way each order item settles as its own atomic on-chain purchase and
// writes its Sale row + stock decrement right away, so a failure mid-order can
// be retried without re-charging settled items.

import { prisma, type SplitSnapshot } from "@/lib/db";
import { createPending, signatureRequest, type PendingTx } from "@/lib/pending-tx";
import { boundOnChainId } from "@/lib/rewards";
import {
  getUsdBalance,
  mintDemoUsd,
  preparePurchase,
  purchasePeriodOf,
  stellarExpertTxUrl,
  stroopsToUsd,
  usdToStroops,
} from "@/lib/stellar";
import type { xdr } from "@stellar/stellar-sdk";

export const orderItemsInclude = {
  items: {
    include: {
      product: {
        select: { id: true, name: true, imageUrl: true, stock: true },
      },
      sale: { select: { id: true } },
    },
  },
  marketplace: { select: { name: true, slug: true } },
} as const;

export function orderPayload(
  order: {
    id: string;
    status: string;
    totalUsd: number;
    expiresAt: Date;
    createdAt: Date;
    completedAt: Date | null;
    marketplace: { name: string; slug: string };
    items: {
      id: string;
      quantity: number;
      unitPriceUsd: number;
      product: { id: string; name: string; imageUrl: string | null };
      sale?: { id: string } | null;
    }[];
  },
) {
  return {
    id: order.id,
    status: order.status,
    totalUsd: order.totalUsd,
    expiresAt: order.expiresAt.toISOString(),
    createdAt: order.createdAt.toISOString(),
    completedAt: order.completedAt?.toISOString() ?? null,
    marketplace: order.marketplace,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.product.id,
      productName: item.product.name,
      imageUrl: item.product.imageUrl,
      quantity: item.quantity,
      unitPriceUsd: item.unitPriceUsd,
      lineTotalUsd: Math.round(item.unitPriceUsd * item.quantity * 100) / 100,
      receiptPath: item.sale ? `/receipt/${item.sale.id}` : null,
    })),
  };
}

export interface Shipping {
  address: string;
  city: string;
  postalCode: string;
  country: string;
}

/** Order with everything settlement needs. */
export function loadOrderForPayment(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      marketplace: {
        include: {
          operator: { select: { name: true } },
          communityFund: { select: { name: true } },
          vendors: { select: { userId: true, payoutAddress: true } },
        },
      },
      items: {
        include: {
          product: {
            include: { vendor: { select: { id: true, name: true, stellarPublicKey: true } } },
          },
          sale: { select: { id: true } },
        },
      },
    },
  });
}
export type PaymentOrder = NonNullable<Awaited<ReturnType<typeof loadOrderForPayment>>>;

/** The address the vendor was registered with on-chain. */
export function vendorAddressFor(order: PaymentOrder, item: PaymentOrder["items"][number]): string | null {
  const membership = order.marketplace.vendors.find((v) => v.userId === item.product.vendorId);
  return membership?.payoutAddress ?? item.product.vendor.stellarPublicKey;
}

export function lineAmount(item: { unitPriceUsd: number; quantity: number }) {
  const lineUsd = Math.round(item.unitPriceUsd * item.quantity * 100) / 100;
  return { lineUsd, amountStroops: usdToStroops(lineUsd) };
}

/** Mints the demo-money shortfall so `address` can cover `totalUsd`. */
export async function topUpDemoBalance(address: string, totalUsd: number) {
  const balance = await getUsdBalance(address);
  if (balance < totalUsd) {
    await mintDemoUsd(address, Math.ceil((totalUsd - balance) * 100) / 100);
  }
}

/** Records one settled item: Sale row (split frozen at purchase time) + stock. */
export async function recordSale(params: {
  order: PaymentOrder;
  item: PaymentOrder["items"][number];
  buyerId: string;
  txHash: string;
  rewardsPeriodId: number | null;
  settleSeconds: number;
  shipping: Shipping;
}) {
  const { order, item, shipping } = params;
  const marketplace = order.marketplace;
  const { lineUsd, amountStroops } = lineAmount(item);
  // Mirrors the contract's math (shares round down, remainder → community).
  const vendorStroops = (amountStroops * BigInt(marketplace.splitVendorBps)) / 10_000n;
  const operatorStroops = (amountStroops * BigInt(marketplace.splitOperatorBps)) / 10_000n;
  const communityStroops = amountStroops - vendorStroops - operatorStroops;
  const snapshot: SplitSnapshot = {
    vendorBps: marketplace.splitVendorBps,
    operatorBps: marketplace.splitOperatorBps,
    communityBps: marketplace.splitCommunityBps,
    vendorAmountUsd: stroopsToUsd(vendorStroops),
    operatorAmountUsd: stroopsToUsd(operatorStroops),
    communityAmountUsd: stroopsToUsd(communityStroops),
    rewardsPeriodId: params.rewardsPeriodId,
  };
  await prisma.$transaction([
    prisma.sale.create({
      data: {
        amountUsd: lineUsd,
        quantity: item.quantity,
        txHash: params.txHash,
        splitSnapshot: JSON.stringify(snapshot),
        settleSeconds: params.settleSeconds,
        shipAddress: shipping.address,
        shipCity: shipping.city,
        shipPostalCode: shipping.postalCode || null,
        shipCountry: shipping.country,
        productId: item.productId,
        buyerId: params.buyerId,
        orderItemId: item.id,
      },
    }),
    prisma.product.update({
      where: { id: item.productId },
      data: { stock: { decrement: item.quantity } },
    }),
  ]);
}

/** Marks the order COMPLETED and returns the checkout success payload. */
export async function completeOrder(orderId: string, shipping: Shipping) {
  const completed = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      shipAddress: shipping.address,
      shipCity: shipping.city,
      shipPostalCode: shipping.postalCode || null,
      shipCountry: shipping.country,
    },
    include: {
      ...orderItemsInclude,
      items: {
        include: {
          product: { select: { id: true, name: true, imageUrl: true, stock: true } },
          sale: { select: { id: true, txHash: true, amountUsd: true } },
        },
      },
    },
  });
  return {
    order: orderPayload(completed),
    sales: completed.items
      .filter((item) => item.sale)
      .map((item) => ({
        saleId: item.sale!.id,
        productName: item.product.name,
        quantity: item.quantity,
        amountUsd: item.sale!.amountUsd,
        txHash: item.sale!.txHash,
        receiptPath: `/receipt/${item.sale!.id}`,
        verifyUrl: stellarExpertTxUrl(item.sale!.txHash),
      })),
  };
}

// ── Cavos (browser-signed) purchases ────────────────────────────────────────

interface PurchaseContext {
  orderId: string;
  itemId: string;
  startedAt: number;
}

function shippingOf(order: PaymentOrder): Shipping {
  return {
    address: order.shipAddress ?? "",
    city: order.shipCity ?? "",
    postalCode: order.shipPostalCode ?? "",
    country: order.shipCountry ?? "",
  };
}

/**
 * Prepares the next unsettled item's purchase for the buyer's Cavos wallet to
 * sign, or completes the order when nothing is left. Shipping must already be
 * stored on the order.
 */
export async function nextCavosPurchaseStep(orderId: string, buyer: { id: string; cavosAddress: string }) {
  const order = await loadOrderForPayment(orderId);
  if (!order) throw new Error(`Order ${orderId} vanished`);
  const unsettled = order.items.filter((item) => !item.sale);
  if (unsettled.length === 0) return completeOrder(order.id, shippingOf(order));

  const onChainId = boundOnChainId(order.marketplace);
  if (onChainId === null) throw new Error("Marketplace is not bound to the configured contract");
  const item = unsettled[0];
  const vendorAddress = vendorAddressFor(order, item);
  if (!vendorAddress) throw new Error(`${item.product.name} has no payout address`);

  const prepared = await preparePurchase({
    buyerPublicKey: buyer.cavosAddress,
    marketplaceId: onChainId,
    vendorPublicKey: vendorAddress,
    amountStroops: lineAmount(item).amountStroops,
  });
  const pending = createPending<PurchaseContext>({
    kind: "purchase",
    userId: buyer.id,
    signer: buyer.cavosAddress,
    xdr: prepared.xdr,
    hash: prepared.hash,
    context: { orderId: order.id, itemId: item.id, startedAt: Date.now() },
  });
  const settledCount = order.items.length - unsettled.length;
  return signatureRequest(pending, `Pay for ${item.product.name}`, {
    step: settledCount + 1,
    steps: order.items.length,
  });
}

/** Called by POST /api/tx/:id once a signed purchase confirmed on-chain. */
export async function completePurchaseStep(
  pending: PendingTx,
  result: { txHash: string; returnValue: xdr.ScVal | undefined },
) {
  const context = pending.context as PurchaseContext;
  const order = await loadOrderForPayment(context.orderId);
  const item = order?.items.find((i) => i.id === context.itemId);
  if (!order || !item) throw new Error(`Order item ${context.itemId} vanished after payment ${result.txHash}`);
  if (!item.sale) {
    await recordSale({
      order,
      item,
      buyerId: pending.userId,
      txHash: result.txHash,
      rewardsPeriodId: purchasePeriodOf(result.returnValue),
      settleSeconds: Math.max(1, Math.round((Date.now() - context.startedAt) / 1000)),
      shipping: shippingOf(order),
    });
  }
  return nextCavosPurchaseStep(order.id, { id: pending.userId, cavosAddress: pending.signer });
}
