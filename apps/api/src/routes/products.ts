// POST /api/products — create a product (session user must be a registered
// vendor of the marketplace).
// PATCH /api/products/:id — edit a product (session user must own it).

import { Hono } from "hono";

import { prisma } from "@/lib/db";
import { parseProductInput } from "@/lib/products";
import { getSessionUser } from "@/lib/session";

export const products = new Hono();

products.post("/", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Not signed in" }, 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const slug = typeof b.marketplaceSlug === "string" ? b.marketplaceSlug : "";
  const input = parseProductInput(body);
  if (typeof input === "string") return c.json({ error: input }, 400);

  const marketplace = await prisma.marketplace.findUnique({ where: { slug } });
  if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);

  const membership = await prisma.vendorMembership.findUnique({
    where: { marketplaceId_userId: { marketplaceId: marketplace.id, userId: user.id } },
  });
  if (!membership) {
    return c.json({ error: "You are not a vendor of this marketplace" }, 403);
  }

  const product = await prisma.product.create({
    data: {
      ...input,
      marketplaceId: marketplace.id,
      vendorId: user.id,
    },
  });
  return c.json({ product }, 201);
});

products.patch("/:id", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Not signed in" }, 401);

  const id = c.req.param("id");
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return c.json({ error: "Product not found" }, 404);
  if (existing.vendorId !== user.id) {
    return c.json({ error: "Not your product" }, 403);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const input = parseProductInput(body);
  if (typeof input === "string") return c.json({ error: input }, 400);

  const product = await prisma.product.update({ where: { id }, data: input });
  return c.json({ product });
});
