import type { PrismaClient } from "@prisma/client";
import { Hono, type Context } from "hono";
import { activeProducts, parseProductInput } from "../lib/products";

type Dependencies = { db: Pick<PrismaClient, "product" | "marketplace" | "vendorMembership">; sessionUser: (c: Context) => Promise<{ id: string } | null> };
export function createProductManagement({ db, sessionUser }: Dependencies) {
  const router = new Hono();
  router.post("/", async c => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "Not signed in" }, 401);
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
    const b = (body ?? {}) as Record<string, unknown>;
    const slug = typeof b.marketplaceSlug === "string" ? b.marketplaceSlug : "";
    const input = parseProductInput(body);
    if (typeof input === "string") return c.json({ error: input }, 400);
    const marketplace = await db.marketplace.findUnique({ where: { slug } });
    if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);
    const membership = await db.vendorMembership.findUnique({ where: { marketplaceId_userId: { marketplaceId: marketplace.id, userId: user.id } } });
    if (!membership) return c.json({ error: "You are not a vendor of this marketplace" }, 403);
    const product = await db.product.create({ data: { ...input, marketplaceId: marketplace.id, vendorId: user.id } });
    return c.json({ product }, 201);
  });
  router.patch("/:id", async c => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "Not signed in" }, 401);
    const id = c.req.param("id");
    const existing = await db.product.findUnique({ where: { id } });
    if (!existing || existing.visibility === "DELETED") return c.json({ error: "Product not found" }, 404);
    if (existing.vendorId !== user.id) return c.json({ error: "Not your product" }, 403);
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
    const input = parseProductInput(body);
    if (typeof input === "string") return c.json({ error: input }, 400);
    const changed = await db.product.updateMany({ where: { id, vendorId: user.id, ...activeProducts }, data: input });
    if (!changed.count) return c.json({ error: "Product not found" }, 404);
    return c.json({ product: await db.product.findUnique({ where: { id } }) });
  });
  return router;
}
