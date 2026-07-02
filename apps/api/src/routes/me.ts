// GET /api/me — session user plus the marketplace they operate (if any).
// Backs the web app's /dashboard redirect.

import { Hono } from "hono";

import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const me = new Hono();

me.get("/", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ user: null, operatedMarketplaceSlug: null });

  const marketplace = await prisma.marketplace.findFirst({
    where: { operatorId: user.id },
    orderBy: { createdAt: "desc" },
    select: { slug: true },
  });
  return c.json({
    user: { id: user.id, name: user.name, email: user.email },
    operatedMarketplaceSlug: marketplace?.slug ?? null,
  });
});
