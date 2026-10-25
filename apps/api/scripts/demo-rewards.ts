/**
 * Community Rewards + fundraising end-to-end proof against testnet (no
 * database needed). Uses the same src/lib/stellar functions as the API:
 *
 * Community Rewards (88% vendor / 5% operator / 5% community + Compaki's 2%):
 *   1. creates a rewards marketplace with one-minute periods whose pool goes
 *      60% to sellers and 40% to buyers, and registers two vendors,
 *   2. two buyers buy from the two vendors ($40 and $60): $5 lands in the
 *      contract, booked to period 1,
 *   3. shows an early claim, the operator claiming for a participant and a
 *      treasury withdrawal by the operator are all rejected,
 *   4. waits for the period's length to pass, shows new rules need the
 *      operator, then the operator distributes it setting the next period
 *      to 30% sellers / 70% buyers, and every seller and buyer claims their
 *      share (by sales and by purchases),
 *   5. shows a second claim and a non-participant's claim are rejected, and
 *      that the next sale lands in the next period with the new split.
 *
 * Fundraising ($5 target → 70% / 30% to two wallets, new round after):
 *   6. a $60 sale raises $3 (release rejected: below target), a $40 sale
 *      reaches $5, the operator releases it choosing an $8 target for
 *      round 2 (a stranger can't pick the target).
 *
 * Run: npm run demo:rewards   (requires a contract with community modes —
 *      `npm run deploy:testnet` or `-- --contract-only`)
 */

import "./load-env";

import {
  ContractError,
  claimReward,
  distributeRewards,
  createCustodialAccount,
  createFundraiseMarketplace,
  createRewardsMarketplace,
  decryptSecret,
  getFundraise,
  getPeriodTotals,
  getReward,
  getRewardsStatus,
  getUsdBalance,
  purchase,
  registerVendor,
  releaseFundraise,
  simulateForbiddenAction,
  sleep,
  stellarConfig,
  stellarExpertContractUrl,
  stellarExpertTxUrl,
  stroopsToUsd,
  usdToStroops,
} from "../src/lib/stellar";

const PERIOD_SECONDS = 60; // the contract's minimum
const usd = (n: number) => `$${n.toFixed(4).replace(/0{1,2}$/, "")}`;

const txs: { step: string; hash: string }[] = [];
const rejections: { step: string; reason: string }[] = [];

function recordTx(step: string, hash: string) {
  txs.push({ step, hash });
  console.log(`    ✔ ${step} · ${stellarExpertTxUrl(hash)}`);
}

/** Runs an action that MUST be rejected by the contract with `expected`. */
async function expectRejected(step: string, expected: string, action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    if (error instanceof ContractError && error.errorName === expected) {
      rejections.push({ step, reason: expected });
      console.log(`    ✔ rejected as expected: ${step} → ${expected}`);
      return;
    }
    throw error;
  }
  throw new Error(`SECURITY CHECK FAILED: "${step}" was not rejected`);
}

async function main(): Promise<void> {
  console.log("── Compaki Community Rewards + fundraising demo (testnet) ──");
  console.log(`Contract: ${stellarExpertContractUrl(stellarConfig.marketplaceContractId)}`);

  console.log("0. Provisioning custodial accounts (Friendbot + trustlines)...");
  const [operator, vendor1, vendor2, buyerA, buyerB, wallet1, wallet2] = await Promise.all([
    createCustodialAccount(),
    createCustodialAccount(),
    createCustodialAccount(),
    createCustodialAccount({ startingUsd: 150 }),
    createCustodialAccount({ startingUsd: 150 }),
    createCustodialAccount(),
    createCustodialAccount(),
  ]);
  const operatorSecret = decryptSecret(operator.secretEncrypted);
  const secretOf = (a: { secretEncrypted: string }) => decryptSecret(a.secretEncrypted);
  const buy = async (buyer: typeof buyerA, vendor: typeof vendor1, marketplaceId: bigint, amount: number) =>
    purchase({
      buyerSecret: secretOf(buyer),
      marketplaceId,
      vendorPublicKey: vendor.publicKey,
      amountStroops: usdToStroops(amount),
    });

  // ── Community Rewards ────────────────────────────────────────────────
  console.log(`1. Rewards marketplace: ${PERIOD_SECONDS}s periods, pool 60% sellers / 40% buyers...`);
  const created = await createRewardsMarketplace({
    operatorSecret,
    vendorBps: 8_800,
    operatorBps: 500,
    communityBps: 500,
    periodSeconds: PERIOD_SECONDS,
    vendorPoolBps: 6_000,
  });
  const marketplaceId = created.marketplaceId;
  recordTx(`create_rewards_marketplace (id ${marketplaceId})`, created.txHash);
  for (const v of [vendor1, vendor2]) {
    recordTx(
      "register_vendor",
      (await registerVendor({ operatorSecret, marketplaceId, vendorPublicKey: v.publicKey })).txHash,
    );
  }

  console.log("2. Buyer A buys $40 from vendor 1, buyer B $60 from vendor 2...");
  const first = await buy(buyerA, vendor1, marketplaceId, 40);
  const period = first.receipt.period;
  if (period === null) throw new Error("purchase was not booked to a period");
  recordTx(`purchase $40.00 → period ${period + 1}`, first.txHash);
  const second = await buy(buyerB, vendor2, marketplaceId, 60);
  recordTx(`purchase $60.00 → period ${(second.receipt.period ?? 0) + 1}`, second.txHash);
  const totals = await getPeriodTotals(marketplaceId, period);
  console.log(
    `    period ${period + 1} on-chain: sellers' pool ${usd(stroopsToUsd(totals.vendorPoolStroops))}, buyers' pool ${usd(stroopsToUsd(totals.buyerPoolStroops))}`,
  );

  console.log("3. Things that must fail...");
  await expectRejected("claim before the distribution", "PeriodNotEnded", () =>
    claimReward({ memberSecret: secretOf(buyerA), marketplaceId, periodId: period }),
  );
  const status = await getRewardsStatus(marketplaceId);
  for (const kind of ["claim-for-someone", "withdraw"] as const) {
    const result = await simulateForbiddenAction({
      kind,
      operatorPublicKey: operator.publicKey,
      marketplaceId,
      amountStroops: status.totalContributedStroops,
      participant: buyerA.publicKey,
      periodId: period,
    });
    if (!result.rejected) throw new Error(`SECURITY CHECK FAILED: operator ${kind} was accepted`);
    rejections.push({ step: `operator ${kind} (control: ${result.control})`, reason: result.reason });
    console.log(`    ✔ rejected as expected: operator ${kind} → ${result.reason} (control: ${result.control})`);
  }

  console.log("4. Waiting for the period's length to pass on the ledger...");
  for (;;) {
    const { ledgerTime, periodEnd } = await getRewardsStatus(marketplaceId);
    if (ledgerTime >= periodEnd) break;
    process.stdout.write(`    ${periodEnd - ledgerTime}s left    \r`);
    await sleep(5_000);
  }
  const nextRules = { vendorPoolBps: 3_000, buyerPoolBps: 7_000, periodSeconds: PERIOD_SECONDS };
  await expectRejected("new rules for the next period without the operator", "Unauthorized", () =>
    distributeRewards({ signerSecret: stellarConfig.usdcIssuerSecret, marketplaceId, next: nextRules }),
  );
  const distributed = await distributeRewards({ signerSecret: operatorSecret, marketplaceId, next: nextRules });
  recordTx(
    `distribute period ${period + 1} (${usd(stroopsToUsd(distributed.poolStroops))}; next: 30% sellers / 70% buyers)`,
    distributed.txHash,
  );
  const participants = [
    ["vendor 1", vendor1],
    ["vendor 2", vendor2],
    ["buyer A", buyerA],
    ["buyer B", buyerB],
  ] as const;
  for (const [label, who] of participants) {
    const reward = await getReward(marketplaceId, period, who.publicKey);
    if (reward.amountStroops === 0n) continue;
    const claimed = await claimReward({ memberSecret: secretOf(who), marketplaceId, periodId: period });
    recordTx(`claim ${label} → ${usd(stroopsToUsd(claimed.amountStroops))}`, claimed.txHash);
  }

  console.log("5. More things that must fail, and the next period...");
  await expectRejected("second claim by buyer A", "AlreadyClaimed", () =>
    claimReward({ memberSecret: secretOf(buyerA), marketplaceId, periodId: period }),
  );
  await expectRejected("claim by someone who didn't sell or buy", "NothingToClaim", () =>
    claimReward({ memberSecret: operatorSecret, marketplaceId, periodId: period }),
  );
  const next = await buy(buyerA, vendor1, marketplaceId, 10);
  const nextTotals = await getPeriodTotals(marketplaceId, next.receipt.period ?? 0);
  recordTx(
    `purchase $10.00 → period ${(next.receipt.period ?? 0) + 1}: sellers ${usd(stroopsToUsd(nextTotals.vendorPoolStroops))} / buyers ${usd(stroopsToUsd(nextTotals.buyerPoolStroops))}`,
    next.txHash,
  );

  // ── Fundraising ──────────────────────────────────────────────────────
  console.log("6. Fundraising marketplace: $5 target → 70% wallet 1 / 30% wallet 2, then a new round...");
  const fund = await createFundraiseMarketplace({
    operatorSecret,
    vendorBps: 8_800,
    operatorBps: 500,
    communityBps: 500,
    targetStroops: usdToStroops(5),
    recipients: [wallet1.publicKey, wallet2.publicKey],
    sharesBps: [7_000, 3_000],
    policy: "new-round",
  });
  recordTx(`create_fundraise_marketplace (id ${fund.marketplaceId})`, fund.txHash);
  recordTx(
    "register_vendor",
    (await registerVendor({ operatorSecret, marketplaceId: fund.marketplaceId, vendorPublicKey: vendor1.publicKey })).txHash,
  );
  recordTx("purchase $60.00 → raised $3.00", (await buy(buyerA, vendor1, fund.marketplaceId, 60)).txHash);
  const stranger = stellarConfig.usdcIssuerSecret; // anyone may release with the default
  await expectRejected("release below the target", "GoalNotReached", () =>
    releaseFundraise({ signerSecret: stranger, marketplaceId: fund.marketplaceId }),
  );
  recordTx("purchase $40.00 → raised $5.00", (await buy(buyerB, vendor1, fund.marketplaceId, 40)).txHash);
  await expectRejected("a stranger choosing the next target", "Unauthorized", () =>
    releaseFundraise({ signerSecret: stranger, marketplaceId: fund.marketplaceId, nextTargetStroops: usdToStroops(1) }),
  );
  const released = await releaseFundraise({
    signerSecret: operatorSecret,
    marketplaceId: fund.marketplaceId,
    nextTargetStroops: usdToStroops(8),
  });
  recordTx(`release_fundraise (${usd(stroopsToUsd(released.amountStroops))} → 70% / 30%; next target $8)`, released.txHash);
  const fundState = await getFundraise(fund.marketplaceId);

  const balances = await Promise.all(
    [vendor1, vendor2, buyerA, buyerB, operator, wallet1, wallet2].map((a) => getUsdBalance(a.publicKey)),
  );
  const expected = [133.2, 54.6, 40.8, 51.2, 10.5, 3.5, 1.5];
  const labels = ["vendor 1", "vendor 2", "buyer A", "buyer B", "operator", "wallet 1", "wallet 2"];

  console.log("────────────────────────────────────────────────────────");
  labels.forEach((label, i) =>
    console.log(`${label.padEnd(9)} ${usd(balances[i]).padEnd(9)} (expected ${usd(expected[i])})`),
  );
  console.log(
    `fundraiser now in round ${fundState.round + 1}, target ${usd(stroopsToUsd(fundState.targetStroops))}, raised ${usd(stroopsToUsd(fundState.raisedStroops))}`,
  );
  console.log("\nMarkdown summary:\n");
  console.log(`Contract: [\`${stellarConfig.marketplaceContractId}\`](${stellarExpertContractUrl(stellarConfig.marketplaceContractId)})\n`);
  console.log("| Step | Transaction |\n| --- | --- |");
  for (const t of txs) console.log(`| ${t.step} | [${t.hash.slice(0, 10)}…](${stellarExpertTxUrl(t.hash)}) |`);
  console.log("\n| Rejected action | Contract answer |\n| --- | --- |");
  for (const r of rejections) console.log(`| ${r.step} | \`${r.reason}\` |`);
}

main().catch((error) => {
  console.error("Rewards demo failed:", error);
  process.exit(1);
});
