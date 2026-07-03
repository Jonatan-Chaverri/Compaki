// GET /api/me — session user plus the marketplace they operate (if any) and
// the marketplaces they sell in (drives the "Vendor dashboard" menu items).

import { Hono } from "hono";

import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const me = new Hono();

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
    user: { id: user.id, name: user.name, email: user.email, country: user.country },
    operatedMarketplaceSlug: marketplace?.slug ?? null,
    vendorMarketplaces: memberships.map((m) => ({
      slug: m.marketplace.slug,
      name: m.marketplace.name,
    })),
  });
});
