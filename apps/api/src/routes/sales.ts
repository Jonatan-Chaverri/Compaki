// GET /api/sales/:id/receipt — public transparent receipt: who got paid what
// from one purchase, with the on-chain transaction to prove it. Public by
// design (transparency is the product); it exposes names and amounts only.

import { Hono } from "hono";

import { prisma, parseSplitSnapshot } from "@/lib/db";
import { communityModeOf } from "@/lib/rewards";
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
              communityFund: { select: { name: true } },
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
          : marketplace.communityFund?.name ?? "Community fund";

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
