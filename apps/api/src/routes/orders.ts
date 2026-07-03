// /api/orders — cart checkout lifecycle:
//
//   POST /          create a PENDING order from the cart (10-minute expiry)
//   GET  /          session buyer's orders (pending + completed; expired hidden)
//   GET  /:id       checkout payload for one order (buyer only)
//   POST /:id/pay   shipping address + payment: settles every item on-chain,
//                   decrements stock, marks the order COMPLETED
//
// Expiry is lazy: any read or pay first flips stale PENDING orders to EXPIRED.

import { Hono } from "hono";

import { prisma, type SplitSnapshot } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import {
  createCustodialAccount,
  decryptSecret,
  getUsdBalance,
  mintDemoUsd,
  purchase,
  stellarExpertTxUrl,
  stroopsToUsd,
  usdToStroops,
} from "@/lib/stellar";

export const orders = new Hono();

/** Pending orders are valid for 10 minutes. */
const ORDER_TTL_MS = 10 * 60 * 1000;

async function expireStaleOrders(buyerId: string) {
  await prisma.order.updateMany({
    where: { buyerId, status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
}

const orderItemsInclude = {
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

function orderPayload(
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

// ── POST / — create a pending order from the cart ───────────────────────────

orders.post("/", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Sign in to place an order" }, 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const slug = typeof b.marketplaceSlug === "string" ? b.marketplaceSlug : "";
  const rawItems = Array.isArray(b.items) ? b.items : [];
  if (rawItems.length === 0) return c.json({ error: "Your cart is empty" }, 400);
  if (rawItems.length > 50) return c.json({ error: "Too many items in one order" }, 400);

  const requested = new Map<string, number>();
  for (const raw of rawItems) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const productId = typeof item.productId === "string" ? item.productId : "";
    const quantity = Number(item.quantity);
    if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      return c.json({ error: "Invalid cart item" }, 400);
    }
    requested.set(productId, (requested.get(productId) ?? 0) + quantity);
  }

  const marketplace = await prisma.marketplace.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });
  if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);

  const products = await prisma.product.findMany({
    where: { id: { in: [...requested.keys()] }, marketplaceId: marketplace.id },
  });
  if (products.length !== requested.size) {
    return c.json({ error: "Some cart items are no longer available" }, 409);
  }
  for (const product of products) {
    const quantity = requested.get(product.id) ?? 0;
    if (product.stock < quantity) {
      return c.json(
        { error: `Only ${product.stock} unit${product.stock === 1 ? "" : "s"} of ${product.name} left in stock` },
        409,
      );
    }
  }

  const totalUsd =
    Math.round(
      products.reduce((acc, p) => acc + p.priceUsd * (requested.get(p.id) ?? 0), 0) * 100,
    ) / 100;

  const order = await prisma.order.create({
    data: {
      totalUsd,
      expiresAt: new Date(Date.now() + ORDER_TTL_MS),
      marketplaceId: marketplace.id,
      buyerId: user.id,
      items: {
        create: products.map((p) => ({
          productId: p.id,
          quantity: requested.get(p.id) ?? 0,
          unitPriceUsd: p.priceUsd,
        })),
      },
    },
    include: orderItemsInclude,
  });

  return c.json({ order: orderPayload(order), checkoutPath: `/m/${marketplace.slug}/checkout/${order.id}` }, 201);
});

// ── GET / — session buyer's orders ──────────────────────────────────────────

orders.get("/", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Not signed in" }, 401);

  await expireStaleOrders(user.id);
  const rows = await prisma.order.findMany({
    where: { buyerId: user.id, status: { in: ["PENDING", "COMPLETED"] } },
    include: orderItemsInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return c.json({ orders: rows.map(orderPayload) });
});

// ── GET /:id — checkout payload ─────────────────────────────────────────────

orders.get("/:id", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Not signed in" }, 401);

  await expireStaleOrders(user.id);
  const order = await prisma.order.findUnique({
    where: { id: c.req.param("id") },
    include: orderItemsInclude,
  });
  if (!order || order.buyerId !== user.id) return c.json({ error: "Order not found" }, 404);
  return c.json({ order: orderPayload(order) });
});

// ── POST /:id/pay — shipping + payment ──────────────────────────────────────
//
// Settles one on-chain split purchase per order item (each item can belong to
// a different vendor). Designed to be resumable: items that already settled
// (they have a Sale row) are skipped, so a retry after a mid-order failure
// doesn't double-charge.

orders.post("/:id/pay", async (c) => {
  const sessionUser = await getSessionUser(c);
  if (!sessionUser) return c.json({ error: "Sign in to pay" }, 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const field = (key: string, max: number) =>
    typeof b[key] === "string" ? (b[key] as string).trim().slice(0, max) : "";
  const shipping = {
    address: field("shipAddress", 200),
    city: field("shipCity", 80),
    postalCode: field("shipPostalCode", 20),
    country: field("shipCountry", 60),
  };
  if (shipping.address.length < 5) {
    return c.json({ error: "Please enter your shipping address" }, 400);
  }
  if (shipping.city.length < 2) return c.json({ error: "Please enter your city" }, 400);
  if (shipping.country.length < 2) {
    return c.json({ error: "Please enter your shipping country" }, 400);
  }

  await expireStaleOrders(sessionUser.id);
  const order = await prisma.order.findUnique({
    where: { id: c.req.param("id") },
    include: {
      marketplace: {
        include: {
          operator: { select: { name: true } },
          communityFund: { select: { name: true } },
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
  if (!order || order.buyerId !== sessionUser.id) {
    return c.json({ error: "Order not found" }, 404);
  }
  if (order.status === "COMPLETED") return c.json({ error: "Order already paid" }, 409);
  if (order.status === "EXPIRED" || order.expiresAt < new Date()) {
    return c.json({ error: "This order expired — please start a new checkout" }, 410);
  }

  const marketplace = order.marketplace;
  if (!marketplace.contractMarketplaceId) {
    return c.json({ error: "This marketplace is not ready for purchases yet" }, 409);
  }
  const unsettled = order.items.filter((item) => !item.sale);
  for (const item of unsettled) {
    if (!item.product.vendor.stellarPublicKey) {
      return c.json({ error: `${item.product.name} is not ready for purchase yet` }, 409);
    }
    if (item.product.stock < item.quantity) {
      return c.json(
        { error: `Only ${item.product.stock} unit${item.product.stock === 1 ? "" : "s"} of ${item.product.name} left in stock` },
        409,
      );
    }
  }

  try {
    // 1. Buyer custodial payment account. First-time buyers start pre-funded
    //    (the "card payment" is simulated by minting demo USDC); returning
    //    buyers get topped up if their balance can't cover the total.
    let buyer = sessionUser;
    if (!buyer.stellarPublicKey || !buyer.stellarSecretEncrypted) {
      const account = await createCustodialAccount({
        startingUsd: Math.max(100, Math.ceil(order.totalUsd)),
      });
      buyer = await prisma.user.update({
        where: { id: buyer.id },
        data: {
          stellarPublicKey: account.publicKey,
          stellarSecretEncrypted: account.secretEncrypted,
        },
      });
    } else {
      const balance = await getUsdBalance(buyer.stellarPublicKey);
      if (balance < order.totalUsd) {
        const shortfall = Math.ceil((order.totalUsd - balance) * 100) / 100;
        await mintDemoUsd(buyer.stellarPublicKey, shortfall);
      }
    }
    const buyerSecret = decryptSecret(buyer.stellarSecretEncrypted as string);

    // 2. One atomic on-chain split purchase per unsettled item. Each item
    //    writes its Sale row + stock decrement immediately, so a failure
    //    mid-order can be retried without re-charging settled items.
    for (const item of unsettled) {
      const lineUsd = Math.round(item.unitPriceUsd * item.quantity * 100) / 100;
      const amountStroops = usdToStroops(lineUsd);
      const settleStart = Date.now();
      const { txHash } = await purchase({
        buyerSecret,
        marketplaceId: BigInt(marketplace.contractMarketplaceId),
        vendorPublicKey: item.product.vendor.stellarPublicKey as string,
        amountStroops,
      });
      const settleSeconds = Math.max(1, Math.round((Date.now() - settleStart) / 1000));

      // Split frozen at purchase time; mirrors the contract's math (shares
      // round down, remainder → community fund).
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
      };
      await prisma.$transaction([
        prisma.sale.create({
          data: {
            amountUsd: lineUsd,
            quantity: item.quantity,
            txHash,
            splitSnapshot: JSON.stringify(snapshot),
            settleSeconds,
            shipAddress: shipping.address,
            shipCity: shipping.city,
            shipPostalCode: shipping.postalCode || null,
            shipCountry: shipping.country,
            productId: item.productId,
            buyerId: buyer.id,
            orderItemId: item.id,
          },
        }),
        prisma.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        }),
      ]);
    }

    // 3. Close the order.
    const completed = await prisma.order.update({
      where: { id: order.id },
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

    return c.json({
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
    });
  } catch (error) {
    console.error("[order-pay] failed:", error);
    return c.json(
      { error: "Payment could not be completed — please try again." },
      500,
    );
  }
});
