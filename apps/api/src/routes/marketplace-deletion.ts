import type { PrismaClient } from "@prisma/client";
import { Hono, type Context } from "hono";

interface Dependencies {
  db: Pick<PrismaClient, "$transaction">;
  sessionUser: (c: Context) => Promise<{ id: string } | null>;
}

/** Delete app records only. No payout, distribution or balance prerequisite. */
export function createMarketplaceDeletion({ db, sessionUser }: Dependencies) {
  const router = new Hono();
  router.delete("/:slug", async c => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "Sign in to delete this marketplace" }, 401);
    try {
      const result = await db.$transaction(async tx => {
        const marketplace = await tx.marketplace.findUnique({
          where: { slug: c.req.param("slug") },
          select: { id: true, operatorId: true },
        });
        if (!marketplace) return "missing";
        if (marketplace.operatorId !== user.id) return "forbidden";
        const marketplaceId = marketplace.id;
        // Remove children before parents; a failure rolls back the entire deletion.
        // User accounts can belong to other marketplaces and are never removed.
        await tx.rewardClaim.deleteMany({ where: { marketplaceId } });
        await tx.rewardsDistribution.deleteMany({ where: { marketplaceId } });
        await tx.fundraiseRelease.deleteMany({ where: { marketplaceId } });
        await tx.sale.deleteMany({ where: { product: { marketplaceId } } });
        await tx.orderItem.deleteMany({ where: { OR: [{ order: { marketplaceId } }, { product: { marketplaceId } }] } });
        await tx.order.deleteMany({ where: { marketplaceId } });
        await tx.product.deleteMany({ where: { marketplaceId } });
        await tx.vendorMembership.deleteMany({ where: { marketplaceId } });
        await tx.marketplace.delete({ where: { id: marketplaceId } });
        return "deleted";
      }, { timeout: 20_000 });
      if (result === "missing") return c.json({ error: "Marketplace not found" }, 404);
      if (result === "forbidden") return c.json({ error: "Only the marketplace owner can delete it" }, 403);
      return c.body(null, 204);
    } catch (error) {
      console.error("[marketplace-deletion] failed:", error);
      return c.json({ error: "Could not delete this marketplace. Please try again." }, 500);
    }
  });
  return router;
}
