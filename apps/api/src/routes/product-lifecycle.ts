import type { PrismaClient } from "@prisma/client";
import { Hono, type Context } from "hono";
import { activeProducts } from "../lib/products";

type Dependencies = { db: Pick<PrismaClient, "product">; sessionUser: (c: Context) => Promise<{ id: string } | null> };
export function createProductLifecycle({ db, sessionUser }: Dependencies) {
  const router = new Hono();
  const change = async (c: Context, visibility: "PUBLISHED" | "HIDDEN" | "DELETED") => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "Not signed in" }, 401);
    const id = c.req.param("id");
    const product = await db.product.findUnique({ where: { id }, select: { vendorId: true, visibility: true } });
    if (!product || product.visibility === "DELETED") return c.json({ error: "Product not found" }, 404);
    if (product.vendorId !== user.id) return c.json({ error: "Not your product" }, 403);
    const result = await db.product.updateMany({ where: { id, vendorId: user.id, ...activeProducts }, data: { visibility } });
    if (!result.count) return c.json({ error: "Product not found" }, 404);
    return visibility === "DELETED" ? c.body(null, 204) : c.json({ visibility });
  };
  router.patch("/:id/visibility", async c => {
    let body: { visibility?: unknown };
    try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
    if (body?.visibility !== "PUBLISHED" && body?.visibility !== "HIDDEN") return c.json({ error: "Invalid product visibility" }, 400);
    return change(c, body.visibility);
  });
  router.delete("/:id", c => change(c, "DELETED"));
  return router;
}
