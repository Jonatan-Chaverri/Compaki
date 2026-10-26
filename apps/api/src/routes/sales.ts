// GET /api/sales/:id/receipt — public transparent receipt: who got paid what
// from one purchase, with the on-chain transaction to prove it. Public by
// design (transparency is the product); it exposes names and amounts only.
// PATCH /api/sales/:id/fulfillment — the item's vendor marks it shipped
// (optionally with tracking) or delivered.

import { Hono } from "hono";

import { prisma, parseSplitSnapshot } from "@/lib/db";
import { canAdvance, fulfillmentOf, type FulfillmentStatus } from "@/lib/fulfillment";
import { communityModeOf } from "@/lib/rewards";
import { getSessionUser } from "@/lib/session";
import { stellarExpertTxUrl } from "@/lib/stellar";

export const sales = new Hono();

sales.get("/:id/receipt", async (c) => {
  const id = c.req.param("id");
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      buyer: { select: { name: true } },
      product: {
        include: {
          vendor: { select: { name: true } },
          marketplace: {
            include: {
              operator: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!sale) return c.json({ error: "Receipt not found" }, 404);

  const marketplace = sale.product.marketplace;

  let snapshot;
  try {
    snapshot = parseSplitSnapshot(sale.splitSnapshot);
  } catch {
    return c.json({ error: "Receipt not found" }, 404);
  }

  // A fundraiser that reached its target with the "stop" policy gives the
  // community share of later sales to the vendor (the contract's receipt
  // says so: community 0, no round).
  const mode = communityModeOf(marketplace);
  const stoppedFundraiser =
    mode === "fundraise" && snapshot.communityBps > 0 && snapshot.communityAmountUsd === 0 && snapshot.fundraiseRound === null;
  const communityRecipient =
    snapshot.rewardsPeriodId !== undefined && snapshot.rewardsPeriodId !== null
      ? `Community Rewards fund · period ${snapshot.rewardsPeriodId + 1}`
      : snapshot.fundraiseRound !== undefined && snapshot.fundraiseRound !== null
        ? `Fundraising fund · round ${snapshot.fundraiseRound + 1}`
        : mode === "fundraise"
          ? "Fundraising recipients (paid directly)"
          : marketplace.communityFundName ?? "Community fund";

  const breakdown = [
    {
      key: "vendor",
      role: "Vendor",
      recipient: sale.product.vendor.name,
      amountUsd: snapshot.vendorAmountUsd,
      percent: (snapshot.vendorBps + (stoppedFundraiser ? snapshot.communityBps : 0)) / 100,
    },
    {
      key: "marketplace",
      role: "Marketplace",
      recipient: marketplace.operator.name,
      amountUsd: snapshot.operatorAmountUsd,
      percent: snapshot.operatorBps / 100,
    },
    ...(snapshot.platformAmountUsd !== undefined && snapshot.platformBps
      ? [
          {
            key: "compaki",
            role: "Compaki fee",
            recipient: "Compaki",
            amountUsd: snapshot.platformAmountUsd,
            percent: snapshot.platformBps / 100,
          },
        ]
      : []),
    ...(snapshot.communityBps > 0 && !stoppedFundraiser
      ? [
          {
            key: "community",
            role: "Community",
            recipient: communityRecipient,
            amountUsd: snapshot.communityAmountUsd,
            percent: snapshot.communityBps / 100,
          },
        ]
      : []),
  ];

  return c.json({
    sale: {
      id: sale.id,
      amountUsd: sale.amountUsd,
      txHash: sale.txHash,
      settleSeconds: sale.settleSeconds,
      createdAt: sale.createdAt.toISOString(),
    },
    product: { name: sale.product.name, imageUrl: sale.product.imageUrl },
    buyer: { name: sale.buyer.name },
    marketplace: { name: marketplace.name, slug: marketplace.slug },
    breakdown,
    verifyUrl: stellarExpertTxUrl(sale.txHash),
  });
});

sales.patch("/:id/fulfillment", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Not signed in" }, 401);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const status = b.status;
  if (status !== "SHIPPED" && status !== "DELIVERED") {
    return c.json({ error: "Status must be SHIPPED or DELIVERED" }, 400);
  }
  const trackingInfo = typeof b.trackingInfo === "string" ? b.trackingInfo.trim().slice(0, 200) : "";

  const sale = await prisma.sale.findUnique({
    where: { id: c.req.param("id") },
    select: {
      fulfillmentStatus: true,
      trackingInfo: true,
      shippedAt: true,
      deliveredAt: true,
      product: { select: { vendorId: true } },
    },
  });
  if (!sale) return c.json({ error: "Sale not found" }, 404);
  if (sale.product.vendorId !== user.id) {
    return c.json({ error: "Only this item's seller can update its delivery status" }, 403);
  }
  const current = fulfillmentOf(sale).status;
  if (!canAdvance(current, status as FulfillmentStatus)) {
    return c.json({ error: "This item was already delivered" }, 409);
  }

  const now = new Date();
  // Conditional on the status read above, so two concurrent updates can't
  // both apply (e.g. "shipped" landing after "delivered").
  const { count } = await prisma.sale.updateMany({
    where: { id: c.req.param("id"), fulfillmentStatus: current },
    data:
      status === "SHIPPED"
        ? { fulfillmentStatus: "SHIPPED", trackingInfo: trackingInfo || null, shippedAt: sale.shippedAt ?? now }
        : { fulfillmentStatus: "DELIVERED", deliveredAt: now, ...(trackingInfo ? { trackingInfo } : {}) },
  });
  if (count === 0) return c.json({ error: "This item's status just changed — refresh and try again" }, 409);

  const updated = await prisma.sale.findUniqueOrThrow({
    where: { id: c.req.param("id") },
    select: { fulfillmentStatus: true, trackingInfo: true, shippedAt: true, deliveredAt: true },
  });
  return c.json({ fulfillment: fulfillmentOf(updated) });
});
