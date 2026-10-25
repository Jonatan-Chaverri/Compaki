import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const exports = {};
const code = ts.transpileModule(readFileSync(new URL("../src/lib/seller-earnings.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports });
const { sellerEarnings } = exports;
const terms = (extra = {}) => ({ marketplace: { name: "Test market", slug: "test" }, vendorBps: 8800, operatorBps: 600, communityBps: 400, platformBps: 200, fundraisingStopped: false, ...extra });

test("earnings change with price and marketplace; the platform fee is not deducted twice", () => {
  const result = sellerEarnings("10", terms());
  assert.equal(result.vendorUsd, 8.8);
  assert.equal(result.operatorUsd, .6);
  assert.equal(result.communityUsd, .4);
  assert.equal(result.platformUsd, .2);
  assert.equal(result.vendorPercent, 88);
  assert.equal(sellerEarnings("25", terms()).vendorUsd, 22);
  assert.equal(sellerEarnings("25", terms({ vendorBps: 8000, operatorBps: 1400 })).vendorUsd, 20);
});

test("uses the saved cent price and contract rounding, including tiny earnings", () => {
  assert.equal(sellerEarnings("12.345", terms()).priceUsd, 12.35);
  assert.equal(sellerEarnings("12.345", terms()).vendorUsd, 10.868);
  assert.equal(sellerEarnings("0.01", terms()).vendorUsd, .0088);
  const result = sellerEarnings("0.01", terms({ vendorBps: 3333, operatorBps: 3333, communityBps: 3134 }));
  assert.equal(result.vendorUsd, .003333);
  assert.equal(result.communityUsd, .003134);
});

test("when fundraising stops the seller receives the community remainder", () => {
  const result = sellerEarnings("10", terms({ fundraisingStopped: true }));
  assert.equal(result.vendorUsd, 9.2);
  assert.equal(result.vendorPercent, 92);
  assert.equal(result.communityUsd, 0);
  assert.equal(result.operatorUsd, .6);
  assert.equal(result.platformUsd, .2);
});

test("invalid prices or unverified shares do not produce a misleading amount", () => {
  for (const price of ["", " ", "0", "-5", "Infinity", "NaN", "1000001"]) assert.equal(sellerEarnings(price, terms()), null);
  for (const extra of [{ vendorBps: 10_001 }, { communityBps: -1 }, { operatorBps: 1.5 }, { platformBps: NaN }, { vendorBps: 9000 }]) assert.equal(sellerEarnings("10", terms(extra)), null);
  assert.equal(sellerEarnings("10", terms({ vendorBps: 0, operatorBps: 9400 })).vendorUsd, 0);
});
