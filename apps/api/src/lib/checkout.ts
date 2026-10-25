// Order settlement shared by both payment paths:
//
//   - custodial buyers: the API signs every item's purchase in one request;
//   - own-wallet buyers (Cavos or e.g. Freighter): the API prepares one item's purchase at a time, the buyer
//     signs it in the browser, and POST /api/tx/:id submits it and comes back
//     here for the next item (completePurchaseStep).
//
// Either way each order item settles as its own atomic on-chain purchase and
// writes its Sale row right away, so a failure mid-order can be retried
// without re-charging settled items.
//
// Stock is taken *before* the payment is submitted (reserveStock), with a
// conditional update, so two buyers paying for the last unit at the same
// time can't both be charged: the second one is refused before any money
// moves. A payment that fails puts the units back (releaseStock).

import { prisma } from "@/lib/db";
import { fulfillmentOf } from "@/lib/fulfillment";
import { createPending, signatureRequest, type PendingTx } from "@/lib/pending-tx";
import { releaseIfReachedById } from "@/lib/fundraise";
import { boundOnChainId } from "@/lib/rewards";
import { splitSnapshot } from "@/lib/splits";
import {
  ConfirmationTimeoutError,
  getUsdBalance,
  mintDemoUsd,
  preparePurchase,
  purchaseReceiptOf,
  type PurchaseReceipt,
  stellarExpertTxUrl,
  usdToStroops,
} from "@/lib/stellar";
import type { xdr } from "@stellar/stellar-sdk";

export const orderItemsInclude = {
  items: {
    include: {
      product: {
        select: { id: true, name: true, imageUrl: true, stock: true },
      },
      sale: {
        select: { id: true, fulfillmentStatus: true, trackingInfo: true, shippedAt: true, deliveredAt: true },
      },
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
      sale?: {
        id: string;
        fulfillmentStatus?: string;
        trackingInfo?: string | null;
        shippedAt?: Date | null;
        deliveredAt?: Date | null;
      } | null;
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
      fulfillment:
        item.sale?.fulfillmentStatus !== undefined
          ? fulfillmentOf({
              fulfillmentStatus: item.sale.fulfillmentStatus,
              trackingInfo: item.sale.trackingInfo ?? null,
              shippedAt: item.sale.shippedAt ?? null,
              deliveredAt: item.sale.deliveredAt ?? null,
            })
          : null,
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

export function outOfStockMessage(productName: string, left: number): string {
  return `Only ${left} unit${left === 1 ? "" : "s"} of ${productName} left in stock`;
}

/** A purchase refused before any money moved (sold out, already paid). */
export class PurchaseRefusedError extends Error {}

/**
 * Takes the item's units out of stock, or throws PurchaseRefusedError when there
 * aren't enough left. Call right before submitting the item's payment.
 */
export async function reserveStock(item: { productId: string; quantity: number; product: { name: string } }) {
  const { count } = await prisma.product.updateMany({
    where: { id: item.productId, stock: { gte: item.quantity } },
    data: { stock: { decrement: item.quantity } },
  });
  if (count === 1) return;
  const product = await prisma.product.findUnique({ where: { id: item.productId }, select: { stock: true } });
  throw new PurchaseRefusedError(outOfStockMessage(item.product.name, Math.max(0, product?.stock ?? 0)));
}

/**
 * Puts a reservation back after its payment failed. A payment whose
 * confirmation timed out may still have gone through, so its units stay
 * taken (at worst a unit is under-sold, never sold twice).
 */
export async function releaseStock(item: { productId: string; quantity: number }, cause: unknown) {
  if (cause instanceof ConfirmationTimeoutError) return;
  await prisma.product.update({
    where: { id: item.productId },
    data: { stock: { increment: item.quantity } },
  });
}

/** Records one settled item: Sale row, with the split frozen at purchase time. */
export async function recordSale(params: {
  order: PaymentOrder;
  item: PaymentOrder["items"][number];
  buyerId: string;
  buyerAddress: string;
  txHash: string;
  receipt: PurchaseReceipt;
  settleSeconds: number;
  shipping: Shipping;
}) {
  const { order, item, shipping } = params;
  const marketplace = order.marketplace;
  const { lineUsd } = lineAmount(item);
  const snapshot = splitSnapshot(
    {
      vendorBps: marketplace.splitVendorBps,
      operatorBps: marketplace.splitOperatorBps,
      communityBps: marketplace.splitCommunityBps,
    },
    params.receipt,
    { buyerAddress: params.buyerAddress, vendorAddress: vendorAddressFor(order, item) ?? "" },
  );
  await prisma.sale.create({
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
  });
  // A fundraising round that this sale pushed past its target is released
  // right away (permissionless on-chain; the API just pays the fee).
  if (params.receipt.round !== null) {
    void releaseIfReachedById(marketplace.id).catch((error) =>
      console.error("[fundraise] automatic release failed:", error),
    );
  }
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

// ── Own-wallet (browser-signed) purchases ────────────────────────────────────────

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
 * Prepares the next unsettled item's purchase for the buyer's own wallet to
 * sign, or completes the order when nothing is left. Shipping must already be
 * stored on the order.
 */
export async function nextOwnWalletPurchaseStep(orderId: string, buyer: { id: string; walletAddress: string }) {
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
    buyerPublicKey: buyer.walletAddress,
    marketplaceId: onChainId,
    vendorPublicKey: vendorAddress,
    amountStroops: lineAmount(item).amountStroops,
  });
  const pending = createPending<PurchaseContext>({
    kind: "purchase",
    userId: buyer.id,
    signer: buyer.walletAddress,
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

/**
 * Called by POST /api/tx/:id before it submits a signed purchase: reserves the
 * item's stock (PurchaseRefusedError when it's gone) and returns what to put back
 * if the submission fails. Refuses an item that is already paid, so a second
 * signed copy of the same purchase is never submitted.
 */
export async function reservePurchaseStock(pending: PendingTx) {
  const context = pending.context as PurchaseContext;
  const item = await prisma.orderItem.findUnique({
    where: { id: context.itemId },
    select: { productId: true, quantity: true, product: { select: { name: true } }, sale: { select: { id: true } } },
  });
  if (!item) throw new Error(`Order item ${context.itemId} vanished`);
  if (item.sale) throw new PurchaseRefusedError(`${item.product.name} is already paid`);
  await reserveStock(item);
  return item;
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
      buyerAddress: pending.signer,
      txHash: result.txHash,
      receipt: purchaseReceiptOf(result.returnValue),
      settleSeconds: Math.max(1, Math.round((Date.now() - context.startedAt) / 1000)),
      shipping: shippingOf(order),
    });
  }
  return nextOwnWalletPurchaseStep(order.id, { id: pending.userId, walletAddress: pending.signer });
}
