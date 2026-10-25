import type { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import type { getSessionUser } from "../lib/session";
import { activeProducts } from "../lib/products";
import { fulfillmentOf } from "../lib/fulfillment";
import { personalWallet } from "../lib/wallets";
import { parseSplitSnapshot } from "../lib/db/types";

type Dependencies = { db: Pick<PrismaClient, "vendorMembership" | "product" | "sale">; sessionUser: typeof getSessionUser };
export function createSellerDashboard({ db, sessionUser }: Dependencies) {
  const router = new Hono();
  router.get("/", async c => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "Not signed in" }, 401);
    const [memberships, products, sales] = await Promise.all([
      db.vendorMembership.findMany({ where: { userId: user.id }, include: { marketplace: { select: { slug: true, name: true, splitVendorBps: true } } }, orderBy: { createdAt: "desc" } }),
      db.product.findMany({ where: { vendorId: user.id, ...activeProducts }, include: { marketplace: { select: { name: true, slug: true } } }, orderBy: { createdAt: "desc" } }),
      db.sale.findMany({ where: { product: { vendorId: user.id } }, include: { product: { select: { name: true, marketplace: { select: { name: true, slug: true } } } }, buyer: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    ]);
    const wallet = personalWallet(user);
    return c.json({
      vendorAccount: wallet.kind === "none" ? null : wallet.address,
      marketplaces: memberships.map(m => ({ slug: m.marketplace.slug, name: m.marketplace.name, vendorBps: m.marketplace.splitVendorBps })),
      products: products.map(p => ({ id: p.id, name: p.name, shortDescription: p.shortDescription, description: p.description, priceUsd: p.priceUsd, stock: p.stock, imageUrl: p.imageUrl, visibility: p.visibility, marketplace: p.marketplace })),
      sales: sales.map(s => {
        let vendorShareUsd = s.amountUsd;
        try {
          const split = parseSplitSnapshot(s.splitSnapshot);
          if (Number.isFinite(split.vendorAmountUsd) && split.vendorAmountUsd >= 0) vendorShareUsd = split.vendorAmountUsd;
        } catch { /* Legacy sale. */ }
        return {
          id: s.id, productName: s.product.name, marketplace: s.product.marketplace, quantity: s.quantity, amountUsd: s.amountUsd, vendorShareUsd,
          createdAt: s.createdAt.toISOString(), txHash: s.txHash, fulfillment: fulfillmentOf(s),
          shipTo: s.shipAddress ? { name: s.buyer.name, address: s.shipAddress, city: s.shipCity ?? "", postalCode: s.shipPostalCode ?? "", country: s.shipCountry ?? "" } : null,
        };
      }),
    });
  });
  return router;
}
