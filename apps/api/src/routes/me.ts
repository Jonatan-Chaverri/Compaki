// GET /api/me — session user plus the marketplace they operate (if any) and
// their global seller capability and the marketplaces they already sell in.
// GET /api/me/marketplaces — every marketplace the session user operates,
// with sales and catalog totals ("My marketplaces").

import { Hono } from "hono";

import { prisma } from "@/lib/db";
import { communityModeOf } from "@/lib/rewards";
import { getSessionUser } from "@/lib/session";
import { ownWalletProvider } from "@/lib/wallets";
import { publishedProducts } from "@/lib/products";
import { createSellerDashboard } from "./seller-dashboard";
import { createSellerEnrollment } from "./seller-enrollment";

export const me = new Hono();
me.route("/seller-dashboard", createSellerDashboard({ db: prisma, sessionUser: getSessionUser }));
me.route("/seller", createSellerEnrollment({ db: prisma, sessionUser: getSessionUser }));

me.get("/", async (c) => {
  const user = await getSessionUser(c);
  if (!user) {
    return c.json({ user: null, operatedMarketplaceSlug: null, vendorMarketplaces: [] });
  }

  const [marketplace, memberships] = await Promise.all([
    prisma.marketplace.findFirst({
      where: { operatorId: user.id },
      orderBy: { createdAt: "desc" },
      select: { slug: true },
    }),
    prisma.vendorMembership.findMany({
      where: { userId: user.id },
      include: { marketplace: { select: { slug: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return c.json({
    user: { id: user.id, name: user.name, email: user.email, country: user.country, isSeller: user.isSeller },
    wallet: {
      address: user.walletAddress,
      provider: user.walletAddress ? ownWalletProvider(user) : null,
      ready: user.walletReadyAt !== null,
    },
    operatedMarketplaceSlug: marketplace?.slug ?? null,
    vendorMarketplaces: memberships.map((m) => ({
      slug: m.marketplace.slug,
      name: m.marketplace.name,
    })),
  });
});

me.get("/marketplaces", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Sign in to see your marketplaces" }, 401);

  const marketplaces = await prisma.marketplace.findMany({
    where: { operatorId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      communityMode: true,
      splitCommunityBps: true,
      createdAt: true,
    },
  });
  const ids = marketplaces.map((m) => m.id);
  const [available, sales] = await Promise.all([
    prisma.product.groupBy({
      by: ["marketplaceId"],
      where: { marketplaceId: { in: ids }, stock: { gt: 0 }, ...publishedProducts },
      _count: { _all: true },
    }),
    Promise.all(
      ids.map((id) =>
        prisma.sale.aggregate({
          where: { product: { marketplaceId: id } },
          _sum: { amountUsd: true },
          _count: { _all: true },
        }),
      ),
    ),
  ]);
  const availableBy = new Map(available.map((row) => [row.marketplaceId, row._count._all]));

  return c.json({
    marketplaces: marketplaces.map((m, i) => ({
      name: m.name,
      slug: m.slug,
      category: m.category,
      communityMode: communityModeOf(m),
      communityBps: m.splitCommunityBps,
      createdAt: m.createdAt.toISOString(),
      revenueUsd: sales[i]._sum.amountUsd ?? 0,
      salesCount: sales[i]._count._all,
      availableProducts: availableBy.get(m.id) ?? 0,
    })),
  });
});
