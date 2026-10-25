import assert from "node:assert/strict";
import test from "node:test";
import { parseCommunityDetails, summarizeCommunitySales } from "./community";

const valid = {
  communityPurpose: "Plant native trees along the community river.",
  communityBeneficiaries: "The local school and reforestation volunteers.",
  communityDistribution: "Each month members collect their share after the rewards period is closed.",
  communityGoalUsd: 2500.50,
};
test("community marketplaces require a meaningful public explanation", () => {
  for (const key of ["communityPurpose", "communityBeneficiaries", "communityDistribution"]) {
    assert.equal(typeof parseCommunityDetails({ ...valid, [key]: " " }, true), "string");
  }
});
test("a valid profile is trimmed and keeps the optional target", () => {
  assert.deepEqual(parseCommunityDetails({ ...valid, communityPurpose: ` ${valid.communityPurpose} ` }, true), valid);
});
test("classic marketplaces without a community contribution remain compatible", () => {
  assert.deepEqual(parseCommunityDetails({}, false), { communityPurpose: "", communityBeneficiaries: "", communityDistribution: "", communityGoalUsd: null });
});
test("targets may be omitted but must be finite positive currency amounts when supplied", () => {
  assert.equal(typeof parseCommunityDetails({ ...valid, communityGoalUsd: null }, true), "object");
  for (const amount of [NaN, Infinity, -1, 0, 1e12, 1.123, "100", {}, []]) {
    assert.equal(typeof parseCommunityDetails({ ...valid, communityGoalUsd: amount }, true), "string", `Rejected ${String(amount)}`);
  }
});
test("rejects incorrect field types and text beyond the documented limits", () => {
  assert.equal(typeof parseCommunityDetails({ ...valid, communityPurpose: [] }, true), "string");
  assert.equal(typeof parseCommunityDetails({ ...valid, communityPurpose: "a".repeat(2001) }, true), "string");
  assert.equal(typeof parseCommunityDetails({ ...valid, communityDistribution: "a".repeat(4001) }, true), "string");
});
test("public profile edits cannot carry payment rules or recipient wallets", () => {
  assert.deepEqual(parseCommunityDetails({ ...valid, splitCommunityBps: 9999, operatorId: "other", rewardsEnabled: false, beneficiaries: ["another wallet"] }, true), valid);
});
const sale = (amount: number, vendor: number, operator: number, community: number) => ({ amountUsd: amount, splitSnapshot: JSON.stringify({ vendorAmountUsd: vendor, operatorAmountUsd: operator, communityAmountUsd: community }) });
test("accumulated contributions include the full supplied history, beyond the dashboard's 50 rows", () => {
  const summary = summarizeCommunitySales(Array.from({ length: 120 }, () => sale(100, 90, 8, 2)));
  assert.deepEqual(summary, { salesCount: 120, grossUsd: 12000, vendorUsd: 10800, operatorUsd: 960, communityUsd: 240, platformUsd: 0, unclassifiedSales: 0 });
});
test("unreadable or incomplete historical splits are reported, never assigned to a recipient", () => {
  const summary = summarizeCommunitySales([sale(100, 90, 8, 2), { amountUsd: 50, splitSnapshot: "broken" }, { amountUsd: 50, splitSnapshot: JSON.stringify({ vendorAmountUsd: 50 }) }, { amountUsd: 10, splitSnapshot: "null" }]);
  assert.deepEqual(summary, { salesCount: 4, grossUsd: 210, vendorUsd: 90, operatorUsd: 8, communityUsd: 2, platformUsd: 0, unclassifiedSales: 3 });
});
test("missing or negative contribution amounts cannot inflate public figures", () => {
  const summary = summarizeCommunitySales([sale(10, 10, 1, -1)]);
  assert.equal(summary.communityUsd, 0);
  assert.equal(summary.unclassifiedSales, 1);
});

test("inconsistent split records cannot inflate lifetime contributions", () => {
  const summary = summarizeCommunitySales([sale(10, 9, 1, 100)]);
  assert.equal(summary.unclassifiedSales, 1);
  assert.equal(summary.communityUsd, 0);
});

test("Compaki's platform fee is part of the split and summed separately", () => {
  const withFee = { amountUsd: 100, splitSnapshot: JSON.stringify({ vendorAmountUsd: 88, operatorAmountUsd: 5, communityAmountUsd: 5, platformAmountUsd: 2 }) };
  const summary = summarizeCommunitySales([withFee, sale(100, 90, 8, 2)]);
  assert.equal(summary.unclassifiedSales, 0);
  assert.equal(summary.platformUsd, 2);
  assert.equal(summary.communityUsd, 7);
  // A fee that doesn't reconcile with the sale is never counted.
  const broken = { amountUsd: 100, splitSnapshot: JSON.stringify({ vendorAmountUsd: 88, operatorAmountUsd: 5, communityAmountUsd: 5, platformAmountUsd: 20 }) };
  assert.equal(summarizeCommunitySales([broken]).unclassifiedSales, 1);
});
