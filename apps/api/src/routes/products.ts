// POST /api/products — create a product (session user must be a registered
// vendor of the marketplace).
// PATCH /api/products/:id — edit a product (session user must own it).
// GET /api/products/:id — public product info for the product detail page.
// Purchases go through /api/orders (cart → pending order → pay).

import { Hono } from "hono";

import { prisma } from "@/lib/db";
import { createProductManagement } from "./product-management";
import { createProductLifecycle } from "./product-lifecycle";
import { communityModeOf } from "@/lib/rewards";
import { getSessionUser } from "@/lib/session";

import { communityFundLabel } from "./marketplaces";

export const products = new Hono();
products.route("/", createProductLifecycle({ db: prisma, sessionUser: getSessionUser }));
products.route("/", createProductManagement({ db: prisma, sessionUser: getSessionUser }));

products.get("/:id", async (c) => {
  const id = c.req.param("id");
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      vendor: { select: { name: true } },
      marketplace: { include: { communityFund: { select: { name: true } } } },
    },
  });
  if (!product || product.visibility !== "PUBLISHED") return c.json({ error: "Product not found" }, 404);

  return c.json({
    product: {
      id: product.id,
      name: product.name,
      shortDescription: product.shortDescription,
      description: product.description,
      priceUsd: product.priceUsd,
      stock: product.stock,
      imageUrl: product.imageUrl,
      vendorName: product.vendor.name,
    },
    marketplace: {
      name: product.marketplace.name,
      slug: product.marketplace.slug,
      regenerativeEnabled: product.marketplace.regenerativeEnabled,
      communityMode: communityModeOf(product.marketplace),
      splitCommunityBps: product.marketplace.splitCommunityBps,
      communityFundName: communityFundLabel(product.marketplace),
    },
  });
});

