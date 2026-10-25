import type { PrismaClient } from "@prisma/client";
import { Hono, type Context } from "hono";
import { activeProducts, parseProductInput, type ProductInput } from "../lib/products";
import { SellerSetupError } from "../lib/seller-errors";

type Dependencies = {
  db: Pick<PrismaClient, "product" | "marketplace">;
  sessionUser: (c: Context) => Promise<{ id: string; isSeller: boolean } | null>;
  /** Registers the seller in the marketplace; may answer with a signature request instead (see seller-registration). */
  ensureVendor: (userId: string, marketplaceId: string, product?: ProductInput) => Promise<unknown>;
};
export function createProductManagement({ db, sessionUser, ensureVendor }: Dependencies) {
  const router = new Hono();
  router.post("/", async c => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "Not signed in" }, 401);
    if (!user.isSeller) return c.json({ error: "Activate your seller profile first" }, 403);
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
    const b = (body ?? {}) as Record<string, unknown>;
    const slug = typeof b.marketplaceSlug === "string" ? b.marketplaceSlug : "";
    const input = parseProductInput(body);
    if (typeof input === "string") return c.json({ error: input }, 400);
    const marketplace = await db.marketplace.findUnique({ where: { slug } });
    if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);
    try {
      // A seller whose wallet must approve the registration gets the
      // transaction to sign (202); the product is created once it confirms.
      const registration = await ensureVendor(user.id, marketplace.id, input);
      if (registration && typeof registration === "object" && "signatureRequired" in registration) {
        return c.json(registration, 202);
      }
    } catch (error) {
      if (error instanceof SellerSetupError) return c.json({ error: error.message }, 409);
      console.error("[seller-publication] setup failed:", error);
      return c.json({ error: "Could not prepare your seller account. Please try again." }, 503);
    }
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
