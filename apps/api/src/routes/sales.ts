// GET /api/sales/:id/receipt — public transparent receipt: who got paid what
// from one purchase, with the on-chain transaction to prove it. Public by
// design (transparency is the product); it exposes names and amounts only.

import { Hono } from "hono";

import { prisma, parseSplitSnapshot } from "@/lib/db";
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

  const breakdown = [
    {
      key: "vendor",
      role: "Vendor",
      recipient: sale.product.vendor.name,
      amountUsd: snapshot.vendorAmountUsd,
      percent: snapshot.vendorBps / 100,
    },
    {
      key: "platform",
      role: "Platform",
      recipient: marketplace.operator.name,
      amountUsd: snapshot.operatorAmountUsd,
      percent: snapshot.operatorBps / 100,
    },
    ...(snapshot.communityBps > 0
      ? [
          {
            key: "community",
            role: "Community",
            recipient: marketplace.communityFund?.name ?? "Community fund",
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
