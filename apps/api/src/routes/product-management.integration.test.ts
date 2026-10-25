import "../env";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Product } from "@prisma/client";
import { Hono } from "hono";
import { createProductManagement } from "./product-management";
import { createProductLifecycle } from "./product-lifecycle";
import { createSellerDashboard } from "./seller-dashboard";
import { publishedProducts } from "../lib/products";

interface Summary { marketplaces: { slug: string }[]; products: { id: string; visibility: string; marketplace: { slug: string } }[]; sales: { marketplace: { slug: string }; vendorShareUsd: number }[]; }

// Explicit opt-in: fixtures exist only in a transaction that always rolls back.
test("seller marketplace selection, product visibility, ownership and historical orders", { skip: process.env.COMPAKI_DATABASE_TESTS !== "1" }, async () => {
  const db = new PrismaClient();
  const rollback = new Error("ROLLBACK_PRODUCT_TEST_FIXTURES");
  try {
    await assert.rejects(db.$transaction(async tx => {
      const owner = await tx.user.create({ data: { name: "Product test owner", role: "VENDOR" } });
      const other = await tx.user.create({ data: { name: "Other test member", role: "VENDOR" } });
      const suffix = randomUUID();
      const markets = await Promise.all(["a", "b", "c"].map(name => tx.marketplace.create({ data: { name: `Product test ${name}`, slug: `test-${name}-${suffix}`, operatorId: owner.id } })));
      await tx.vendorMembership.createMany({ data: markets.slice(0, 2).map(m => ({ marketplaceId: m.id, userId: owner.id })) });
      const app = new Hono();
      const deps = { db: tx, sessionUser: async () => owner };
      app.route("/products", createProductManagement(deps));
      app.route("/products", createProductLifecycle(deps));
      app.route("/seller", createSellerDashboard(deps));
      const body = { name: "Test honey", priceUsd: 15, stock: 20, shortDescription: "Test", description: "Test", imageUrl: "🍯" };
      const request = (path: string, method: string, value?: unknown) => app.request(path, { method, ...(value ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) } : {}) });
      const create = await request("/products", "POST", { ...body, marketplaceSlug: markets[1].slug });
      assert.equal(create.status, 201);
      const { product } = await create.json() as { product: Product };
      assert.equal(product.marketplaceId, markets[1].id);
      assert.equal(product.visibility, "PUBLISHED");
      assert.equal((await request("/products", "POST", { ...body, marketplaceSlug: markets[2].slug })).status, 403);
      const otherProduct = await tx.product.create({ data: { name: "Other seller's product", priceUsd: 7, marketplaceId: markets[0].id, vendorId: other.id } });
      assert.equal((await request(`/products/${otherProduct.id}`, "PATCH", body)).status, 403);
      assert.equal((await request(`/products/${otherProduct.id}/visibility`, "PATCH", { visibility: "HIDDEN" })).status, 403);
      assert.equal((await request(`/products/${otherProduct.id}`, "DELETE")).status, 403);
      const guest = new Hono().route("/products", createProductLifecycle({ db: tx, sessionUser: async () => null }));
      assert.equal((await guest.request(`/products/${product.id}`, { method: "DELETE" })).status, 401);
      assert.equal((await request(`/products/${product.id}/visibility`, "PATCH", { visibility: "DELETED" })).status, 400);
      assert.equal((await request(`/products/${product.id}/visibility`, "PATCH", { visibility: "HIDDEN" })).status, 200);
      assert.equal(await tx.product.count({ where: { id: product.id, ...publishedProducts } }), 0);
      const summary = await (await request("/seller", "GET")).json() as Summary;
      assert.equal(summary.marketplaces.length, 2);
      assert.deepEqual(summary.products.map((p: { id: string }) => p.id), [product.id]);
      assert.equal(summary.products[0].marketplace.slug, markets[1].slug);
      assert.equal(summary.products[0].visibility, "HIDDEN");
      assert.equal((await request(`/products/${product.id}/visibility`, "PATCH", { visibility: "PUBLISHED" })).status, 200);
      assert.equal(await tx.product.count({ where: { id: product.id, ...publishedProducts } }), 1);
      const order = await tx.order.create({ data: { buyerId: other.id, marketplaceId: markets[1].id, totalUsd: 15, expiresAt: new Date(Date.now() + 60000), status: "COMPLETED", items: { create: { productId: product.id, quantity: 1, unitPriceUsd: 15 } } }, include: { items: true } });
      const sale = await tx.sale.create({ data: { productId: product.id, buyerId: other.id, amountUsd: 15, txHash: suffix, splitSnapshot: JSON.stringify({ vendorBps: 9000, operatorBps: 1000, communityBps: 0, vendorAmountUsd: 13.5, operatorAmountUsd: 1.5, communityAmountUsd: 0 }), orderItemId: order.items[0].id } });
      assert.equal((await request(`/products/${product.id}`, "DELETE")).status, 204);
      assert.equal(await tx.product.count({ where: { id: product.id, ...publishedProducts } }), 0);
      assert.equal((await request(`/products/${product.id}/visibility`, "PATCH", { visibility: "PUBLISHED" })).status, 404);
      assert.equal((await request(`/products/${product.id}`, "PATCH", body)).status, 404);
      assert.ok(await tx.sale.findUnique({ where: { id: sale.id } }));
      assert.ok(await tx.orderItem.findUnique({ where: { id: order.items[0].id } }));
      const finalSummary = await (await request("/seller", "GET")).json() as Summary;
      assert.equal(finalSummary.products.length, 0);
      assert.equal(finalSummary.sales[0].marketplace.slug, markets[1].slug);
      assert.equal(finalSummary.sales[0].vendorShareUsd, 13.5);
      throw rollback;
    }, { timeout: 45_000 }), error => error === rollback);
  } finally { await db.$disconnect(); }
});
