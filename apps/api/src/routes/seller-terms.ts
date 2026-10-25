import type { Marketplace, PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import type { getSessionUser } from "../lib/session";
import { PLATFORM_FEE_BPS } from "../lib/splits";

export type SellerTermsMarketplace = Pick<Marketplace, "slug" | "name" | "splitVendorBps" | "splitOperatorBps" | "splitCommunityBps" | "communityMode" | "contractId" | "contractMarketplaceId">;
type Dependencies = {
  db: Pick<PrismaClient, "marketplace">;
  sessionUser: typeof getSessionUser;
  fundraisingStopped: (marketplace: SellerTermsMarketplace) => Promise<boolean>;
};

export function createSellerTerms({ db, sessionUser, fundraisingStopped }: Dependencies) {
  const router = new Hono();
  router.get("/", async c => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "Not signed in" }, 401);
    if (!user.isSeller) return c.json({ error: "Activate your seller profile first" }, 403);
    const slug = c.req.query("marketplace");
    if (!slug) return c.json({ error: "Marketplace is required" }, 400);
    const marketplace = await db.marketplace.findUnique({ where: { slug }, select: {
      slug: true, name: true, splitVendorBps: true, splitOperatorBps: true, splitCommunityBps: true,
      communityMode: true, contractId: true, contractMarketplaceId: true,
    } });
    if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);
    try {
      const stopped = marketplace.communityMode === "fundraise" ? await fundraisingStopped(marketplace) : false;
      c.header("Cache-Control", "no-store");
      return c.json({
        marketplace: { slug: marketplace.slug, name: marketplace.name },
        vendorBps: marketplace.splitVendorBps, operatorBps: marketplace.splitOperatorBps,
        communityBps: marketplace.splitCommunityBps, platformBps: PLATFORM_FEE_BPS,
        fundraisingStopped: stopped,
      });
    } catch (error) {
      console.error("[seller-terms] failed:", error);
      return c.json({ error: "Could not load the current marketplace rules" }, 503);
    }
  });
  return router;
}
