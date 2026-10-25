// /api/orders — cart checkout lifecycle:
//
//   POST /          create a PENDING order from the cart (10-minute expiry)
//   GET  /          session buyer's orders (pending + completed; expired hidden)
//   GET  /:id       checkout payload for one order (buyer only)
//   POST /:id/pay   shipping address + payment: settles every item on-chain,
//                   decrements stock, marks the order COMPLETED. Buyers with their
//                   own wallet (Cavos or e.g. Freighter) sign each item in the browser: this returns
//                   202 + the first transaction to sign, and POST /api/tx/:id
//                   continues item by item (see src/lib/checkout.ts).
//
// Expiry is lazy: any read or pay first flips stale PENDING orders to EXPIRED.

import { Hono } from "hono";

import {
  completeOrder,
  lineAmount,
  loadOrderForPayment,
  nextOwnWalletPurchaseStep,
  orderItemsInclude,
  orderPayload,
  outOfStockMessage,
  PurchaseRefusedError,
  recordSale,
  releaseStock,
  reserveStock,
  topUpDemoBalance,
  vendorAddressFor,
} from "@/lib/checkout";
import { prisma } from "@/lib/db";
import { boundOnChainId, describeContractError } from "@/lib/rewards";
import { getSessionUser } from "@/lib/session";
import { createCustodialAccount, decryptSecret, purchase } from "@/lib/stellar";
import { ownWalletPending, personalWallet } from "@/lib/wallets";
import { publishedProducts } from "@/lib/products";

export const orders = new Hono();

/** Pending orders are valid for 10 minutes. */
const ORDER_TTL_MS = 10 * 60 * 1000;

async function expireStaleOrders(buyerId: string) {
  await prisma.order.updateMany({
    where: { buyerId, status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
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
    where: { id: { in: [...requested.keys()] }, marketplaceId: marketplace.id, ...publishedProducts },
  });
  if (products.length !== requested.size) {
    return c.json({ error: "Some cart items are no longer available" }, 409);
  }
  for (const product of products) {
    const quantity = requested.get(product.id) ?? 0;
    if (product.stock < quantity) {
      return c.json(
        { error: outOfStockMessage(product.name, product.stock) },
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
// a different vendor) — the cart is NOT one atomic transaction; each item's
// split is. Designed to be resumable: items that already settled (they have
// a Sale row) are skipped, so a retry after a mid-order failure doesn't
// double-charge.
//
// Community Rewards marketplaces: each item's community share is booked to
// the active period on-chain. With no active period the contract rejects the
// purchase (no money moves) and the API answers 409 — items settled earlier
// in the same order stay settled.

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
  const order = await loadOrderForPayment(c.req.param("id"));
  if (!order || order.buyerId !== sessionUser.id) {
    return c.json({ error: "Order not found" }, 404);
  }
  if (order.status === "COMPLETED") return c.json({ error: "Order already paid" }, 409);
  if (order.status === "EXPIRED" || order.expiresAt < new Date()) {
    return c.json({ error: "This order expired — please start a new checkout" }, 410);
  }

  const marketplace = order.marketplace;
  const onChainId = boundOnChainId(marketplace);
  if (onChainId === null) {
    return c.json({ error: "This marketplace is not ready for purchases yet" }, 409);
  }
  const unsettled = order.items.filter((item) => !item.sale);
  for (const item of unsettled) {
    if (!vendorAddressFor(order, item)) {
      return c.json({ error: `${item.product.name} is not ready for purchase yet` }, 409);
    }
    // Early, friendly check; reserveStock below is what actually guarantees it.
    if (item.product.stock < item.quantity) {
      return c.json({ error: outOfStockMessage(item.product.name, item.product.stock) }, 409);
    }
  }
  if (ownWalletPending(sessionUser)) {
    return c.json({ error: "Finish setting up your wallet first", code: "WALLET_SETUP" }, 409);
  }
  const remainingUsd = unsettled.reduce((acc, item) => acc + lineAmount(item).lineUsd, 0);

  try {
    const wallet = personalWallet(sessionUser);

    // Own wallet (Cavos or an existing Stellar wallet): the buyer signs each
    // item in the browser. The demo
    // "card payment" tops the wallet up with demo money first.
    if (wallet.kind === "own") {
      await topUpDemoBalance(wallet.address, remainingUsd);
      await prisma.order.update({
        where: { id: order.id },
        data: {
          shipAddress: shipping.address,
          shipCity: shipping.city,
          shipPostalCode: shipping.postalCode || null,
          shipCountry: shipping.country,
        },
      });
      const step = await nextOwnWalletPurchaseStep(order.id, {
        id: sessionUser.id,
        walletAddress: wallet.address,
      });
      return c.json(step, "signatureRequired" in step ? 202 : 200);
    }

    // Custodial account: first-time buyers start pre-funded (the "card
    // payment" is simulated by minting demo money); returning buyers get
    // topped up if their balance can't cover the order.
    let buyerSecretEncrypted: string;
    let buyerAddress: string;
    if (wallet.kind === "none") {
      const account = await createCustodialAccount({
        startingUsd: Math.max(100, Math.ceil(remainingUsd)),
      });
      await prisma.user.update({
        where: { id: sessionUser.id },
        data: {
          stellarPublicKey: account.publicKey,
          stellarSecretEncrypted: account.secretEncrypted,
        },
      });
      buyerSecretEncrypted = account.secretEncrypted;
      buyerAddress = account.publicKey;
    } else {
      await topUpDemoBalance(wallet.address, remainingUsd);
      buyerSecretEncrypted = wallet.secretEncrypted;
      buyerAddress = wallet.address;
    }
    const buyerSecret = decryptSecret(buyerSecretEncrypted);

    // One atomic on-chain split purchase per unsettled item, recorded as it
    // settles so a failure mid-order can be retried without re-charging.
    for (const item of unsettled) {
      const settleStart = Date.now();
      await reserveStock(item);
      let settled;
      try {
        settled = await purchase({
          buyerSecret,
          marketplaceId: onChainId,
          vendorPublicKey: vendorAddressFor(order, item) as string,
          amountStroops: lineAmount(item).amountStroops,
        });
      } catch (error) {
        await releaseStock(item, error);
        throw error;
      }
      const { txHash, receipt } = settled;
      await recordSale({
        order,
        item,
        buyerId: sessionUser.id,
        buyerAddress,
        txHash,
        receipt,
        settleSeconds: Math.max(1, Math.round((Date.now() - settleStart) / 1000)),
        shipping,
      });
    }

    return c.json(await completeOrder(order.id, shipping));
  } catch (error) {
    if (error instanceof PurchaseRefusedError) return c.json({ error: error.message }, 409);
    const known = describeContractError(error);
    if (known) {
      return c.json({ error: known.message, code: known.code }, known.status);
    }
    console.error("[order-pay] failed:", error);
    return c.json(
      { error: "Payment could not be completed — please try again." },
      500,
    );
  }
});
