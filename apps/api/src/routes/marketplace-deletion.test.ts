import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { createMarketplaceDeletion } from "./marketplace-deletion";

function fixture({ userId = "owner", ownerId = "owner", exists = true, fail = false }: { userId?: string | null; ownerId?: string; exists?: boolean; fail?: boolean } = {}) {
  const writes: { model: string; args: unknown }[] = [];
  let transactions = 0;
  let committed = false;
  const children = Object.fromEntries(["rewardClaim", "rewardsDistribution", "fundraiseRelease", "sale", "orderItem", "order", "product", "vendorMembership"].map(model => [model, {
    deleteMany: async (args: unknown) => { writes.push({ model, args }); return { count: 3 }; },
  }]));
  const tx = { ...children, marketplace: {
    findUnique: async ({ where }: { where: { slug: string } }) => {
      assert.equal(where.slug, "test-market");
      return exists ? { id: "market-id", operatorId: ownerId } : null;
    },
    delete: async (args: unknown) => {
      if (fail) throw new Error("Simulated database failure");
      writes.push({ model: "marketplace", args });
    },
  } };
  const db = { $transaction: async (action: (value: unknown) => Promise<unknown>) => {
    transactions++;
    const result = await action(tx);
    committed = true;
    return result;
  } } as unknown as PrismaClient;
  const app = createMarketplaceDeletion({ db, sessionUser: async () => userId ? { id: userId } : null });
  return { request: () => app.request("/test-market", { method: "DELETE" }), writes, transactions: () => transactions, committed: () => committed };
}

test("anonymous visitors cannot delete a marketplace", async () => {
  const f = fixture({ userId: null });
  assert.equal((await f.request()).status, 401);
  assert.equal(f.transactions(), 0);
  assert.equal(f.writes.length, 0);
});

test("another member cannot delete a marketplace they do not own", async () => {
  const f = fixture({ userId: "other-member" });
  assert.equal((await f.request()).status, 403);
  assert.equal(f.writes.length, 0);
});

test("missing marketplaces return 404 without touching records", async () => {
  const f = fixture({ exists: false });
  assert.equal((await f.request()).status, 404);
  assert.equal(f.writes.length, 0);
});

test("the owner can delete all app records, scoped to one marketplace in one transaction", async () => {
  const f = fixture();
  assert.equal((await f.request()).status, 204);
  assert.equal(f.transactions(), 1);
  assert.equal(f.committed(), true);
  assert.equal(f.writes.length, 9);
  for (const write of f.writes) {
    const where = (write.args as { where: unknown }).where;
    if (write.model === "sale") assert.deepEqual(where, { product: { marketplaceId: "market-id" } });
    else if (write.model === "orderItem") assert.deepEqual(where, { OR: [{ order: { marketplaceId: "market-id" } }, { product: { marketplaceId: "market-id" } }] });
    else if (write.model === "marketplace") assert.deepEqual(where, { id: "market-id" });
    else assert.deepEqual(where, { marketplaceId: "market-id" });
  }
  // Products' sales and order items must be removed before their parents.
  const index = (name: string) => f.writes.findIndex(write => write.model === name);
  assert.ok(index("sale") < index("orderItem"));
  assert.ok(index("orderItem") < index("order"));
  assert.ok(index("orderItem") < index("product"));
  assert.equal(f.writes.at(-1)?.model, "marketplace");
});

test("a database failure does not report a successful or committed deletion", async () => {
  const f = fixture({ fail: true });
  assert.equal((await f.request()).status, 500);
  assert.equal(f.committed(), false);
});
