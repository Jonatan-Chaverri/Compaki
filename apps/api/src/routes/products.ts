// POST /api/products — create a product (session user must be a registered
// vendor of the marketplace).
// PATCH /api/products/:id — edit a product (session user must own it).
// GET /api/products/:id — public product info for the checkout page.
// POST /api/products/:id/purchase — buy a product (session user is the buyer;
// requires a shipping address; simulated card on-ramp: custodial buyer account
// pre-funded with demo USDC, then an atomic on-chain split purchase).

import { Hono } from "hono";

import { prisma, type SplitSnapshot } from "@/lib/db";
import { parseProductInput } from "@/lib/products";
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

export const products = new Hono();

products.post("/", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Not signed in" }, 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const slug = typeof b.marketplaceSlug === "string" ? b.marketplaceSlug : "";
  const input = parseProductInput(body);
  if (typeof input === "string") return c.json({ error: input }, 400);

  const marketplace = await prisma.marketplace.findUnique({ where: { slug } });
  if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);

  const membership = await prisma.vendorMembership.findUnique({
    where: { marketplaceId_userId: { marketplaceId: marketplace.id, userId: user.id } },
  });
  if (!membership) {
    return c.json({ error: "You are not a vendor of this marketplace" }, 403);
  }

  const product = await prisma.product.create({
    data: {
      ...input,
      marketplaceId: marketplace.id,
      vendorId: user.id,
    },
  });
  return c.json({ product }, 201);
});

products.get("/:id", async (c) => {
  const id = c.req.param("id");
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      vendor: { select: { name: true } },
      marketplace: { include: { communityFund: { select: { name: true } } } },
    },
  });
  if (!product) return c.json({ error: "Product not found" }, 404);

  return c.json({
    product: {
      id: product.id,
      name: product.name,
      description: product.description,
      priceUsd: product.priceUsd,
      imageUrl: product.imageUrl,
      vendorName: product.vendor.name,
    },
    marketplace: {
      name: product.marketplace.name,
      slug: product.marketplace.slug,
      regenerativeEnabled: product.marketplace.regenerativeEnabled,
      splitCommunityBps: product.marketplace.splitCommunityBps,
      communityFundName: product.marketplace.communityFund?.name ?? null,
    },
  });
});

products.post("/:id/purchase", async (c) => {
  const id = c.req.param("id");

  const sessionUser = await getSessionUser(c);
  if (!sessionUser) return c.json({ error: "Sign in to buy" }, 401);

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

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      vendor: { select: { id: true, name: true, stellarPublicKey: true } },
      marketplace: {
        include: {
          operator: { select: { name: true } },
          communityFund: { select: { name: true } },
        },
      },
    },
  });
  if (!product) return c.json({ error: "Product not found" }, 404);
  const marketplace = product.marketplace;
  if (!marketplace.contractMarketplaceId || !product.vendor.stellarPublicKey) {
    return c.json({ error: "This product is not ready for purchase yet" }, 409);
  }

  try {
    // 1. Buyer custodial payment account. First-time buyers start pre-funded
    //    (the "card payment" is simulated by minting demo USDC); returning
    //    buyers get topped up if their balance can't cover the price.
    let buyer = sessionUser;
    if (!buyer.stellarPublicKey || !buyer.stellarSecretEncrypted) {
      const account = await createCustodialAccount({
        startingUsd: Math.max(100, Math.ceil(product.priceUsd)),
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
      if (balance < product.priceUsd) {
        const shortfall = Math.ceil((product.priceUsd - balance) * 100) / 100;
        await mintDemoUsd(buyer.stellarPublicKey, shortfall);
      }
    }

    // 2. Atomic on-chain split purchase, signed by the buyer's custodial key.
    //    Timed so the receipt can say "settled in N seconds".
    const amountStroops = usdToStroops(product.priceUsd);
    const settleStart = Date.now();
    const { txHash } = await purchase({
      buyerSecret: decryptSecret(buyer.stellarSecretEncrypted as string),
      marketplaceId: BigInt(marketplace.contractMarketplaceId),
      vendorPublicKey: product.vendor.stellarPublicKey,
      amountStroops,
    });
    const settleSeconds = Math.max(1, Math.round((Date.now() - settleStart) / 1000));

    // 3. Sale row with the split frozen at purchase time. Mirrors the
    //    contract's math: shares round down, remainder → community fund.
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
    const sale = await prisma.sale.create({
      data: {
        amountUsd: product.priceUsd,
        txHash,
        splitSnapshot: JSON.stringify(snapshot),
        settleSeconds,
        shipAddress: shipping.address,
        shipCity: shipping.city,
        shipPostalCode: shipping.postalCode || null,
        shipCountry: shipping.country,
        productId: product.id,
        buyerId: buyer.id,
      },
    });

    const breakdown = [
      {
        key: "vendor",
        label: "Vendor",
        recipient: product.vendor.name,
        amountUsd: snapshot.vendorAmountUsd,
      },
      {
        key: "platform",
        label: "Platform",
        recipient: marketplace.operator.name,
        amountUsd: snapshot.operatorAmountUsd,
      },
      ...(marketplace.splitCommunityBps > 0
        ? [
            {
              key: "community",
              label: "Community",
              recipient: marketplace.communityFund?.name ?? "Community fund",
              amountUsd: snapshot.communityAmountUsd,
            },
          ]
        : []),
    ];

    return c.json(
      {
        sale: { id: sale.id, amountUsd: sale.amountUsd, txHash },
        product: { name: product.name },
        breakdown,
        verifyUrl: stellarExpertTxUrl(txHash),
        receiptPath: `/receipt/${sale.id}`,
      },
      201,
    );
  } catch (error) {
    console.error("[purchase] failed:", error);
    return c.json(
      { error: "Payment could not be completed — please try again." },
      500,
    );
  }
});

products.patch("/:id", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Not signed in" }, 401);

  const id = c.req.param("id");
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return c.json({ error: "Product not found" }, 404);
  if (existing.vendorId !== user.id) {
    return c.json({ error: "Not your product" }, 403);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const input = parseProductInput(body);
  if (typeof input === "string") return c.json({ error: input }, 400);

  const product = await prisma.product.update({ where: { id }, data: input });
  return c.json({ product });
});
