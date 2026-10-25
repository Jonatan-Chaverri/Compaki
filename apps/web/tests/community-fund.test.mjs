import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const exports = {};
const code = ts.transpileModule(readFileSync(new URL("../src/lib/community.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
vm.runInNewContext(code, { exports });
const { communityFundSummary } = exports;
const sample = (mode, extra = {}) => ({
  marketplace: { communityMode: mode },
  sales: { communityUsd: 900 }, // Sales history must never stand in for live funds.
  communityBalanceUsd: null,
  rewards: null,
  fundraise: null,
  ...extra,
});

test("the balance includes uncollected earlier rewards; only the current pool is next", () => {
  const summary = communityFundSummary(sample("rewards", { rewards: {
    bound: true, currentPeriod: 4,
    treasury: { contributedUsd: 700, claimedUsd: 450, heldUsd: 250 },
    periods: [
      { periodId: 3, status: "ended", vendorPoolUsd: 100, buyerPoolUsd: 100 },
      { periodId: 4, status: "current", vendorPoolUsd: 70, buyerPoolUsd: 30 },
    ],
  } }));
  assert.equal(summary.balanceUsd, 250);
  assert.equal(summary.nextPoolUsd, 100);
  assert.equal(summary.previousUnclaimedUsd, 150);
});

test("missing verification never displays sales totals or an unbound zero as the live balance", () => {
  for (const mode of ["rewards", "fundraise", "classic"]) {
    const result = communityFundSummary(sample(mode, {
      rewards: { bound: false, treasury: { heldUsd: 0 }, periods: [] },
      fundraise: { bound: false, totalRaisedUsd: 0, totalReleasedUsd: 0 },
    }));
    assert.equal(result.balanceUsd, null);
    assert.equal(result.nextPoolUsd, null);
  }
});

test("a verified empty pool is zero; an unavailable current period is unknown", () => {
  const rewards = { bound: true, currentPeriod: 0, treasury: { heldUsd: 0 }, periods: [] };
  assert.equal(communityFundSummary(sample("rewards", { rewards })).nextPoolUsd, null);
  rewards.periods.push({ periodId: 0, status: "current", vendorPoolUsd: 0, buyerPoolUsd: 0 });
  const result = communityFundSummary(sample("rewards", { rewards }));
  assert.equal(result.balanceUsd, 0);
  assert.equal(result.nextPoolUsd, 0);
});

test("fundraising shows unreleased funds; classic shows the actual account balance", () => {
  const fundraiser = communityFundSummary(sample("fundraise", { fundraise: {
    bound: true, totalRaisedUsd: 600, totalReleasedUsd: 450, raisedUsd: 150,
  } }));
  assert.equal(fundraiser.balanceUsd, 150);
  assert.equal(communityFundSummary(sample("classic", { communityBalanceUsd: 37 })).balanceUsd, 37);
});
