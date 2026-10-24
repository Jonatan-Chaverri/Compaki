/**
 * Community Rewards end-to-end proof against testnet (no database needed).
 * Uses the same src/lib/stellar functions as the API:
 *
 *   1. provisions operator / vendor / buyer / 3 member custodial accounts,
 *   2. creates a rewards marketplace (90% vendor / 5% operator / 5% community)
 *      and registers the vendor,
 *   3. shows a purchase is REJECTED while no period is open,
 *   4. opens a period (members 50% / 30% / 20%) ending in DEMO_PERIOD_SECONDS,
 *   5. buys twice — the community share lands in the contract treasury,
 *   6. shows premature close, early claim, rule change and a treasury
 *      withdrawal by the operator are all rejected,
 *   7. waits for the ledger to pass the end time, closes, claims for all
 *      three members, and shows a second claim is rejected.
 *
 * Run: npm run demo:rewards   (requires a contract with Community Rewards —
 *      `npm run deploy:testnet` or `-- --contract-only`)
 */

import "./load-env";

import {
  ContractError,
  claimReward,
  closeRewardsPeriod,
  createCustodialAccount,
  createRewardsMarketplace,
  decryptSecret,
  getRewardsEntitlements,
  getRewardsPeriod,
  getRewardsStatus,
  getUsdBalance,
  openRewardsPeriod,
  purchase,
  registerVendor,
  simulateForbiddenAction,
  sleep,
  stellarConfig,
  stellarExpertContractUrl,
  stellarExpertTxUrl,
  stroopsToUsd,
  usdToStroops,
} from "../src/lib/stellar";

const PERIOD_SECONDS = Number(process.env.DEMO_PERIOD_SECONDS ?? 45);
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
  console.log("── Compaki Community Rewards demo (testnet) ────────────");
  console.log(`Contract: ${stellarExpertContractUrl(stellarConfig.marketplaceContractId)}`);

  console.log("1. Provisioning custodial accounts (Friendbot + trustlines)...");
  const [operator, vendor, buyer, memberA, memberB, memberC] = await Promise.all([
    createCustodialAccount(),
    createCustodialAccount(),
    createCustodialAccount({ startingUsd: 100 }),
    createCustodialAccount(),
    createCustodialAccount(),
    createCustodialAccount(),
  ]);
  const operatorSecret = decryptSecret(operator.secretEncrypted);
  const buyerSecret = decryptSecret(buyer.secretEncrypted);

  console.log("2. Creating a rewards marketplace (90/5/5) + registering the vendor...");
  const created = await createRewardsMarketplace({
    operatorSecret,
    vendorBps: 9_000,
    operatorBps: 500,
    communityBps: 500,
  });
  const marketplaceId = created.marketplaceId;
  recordTx(`create_rewards_marketplace (id ${marketplaceId})`, created.txHash);
  recordTx(
    "register_vendor",
    (await registerVendor({ operatorSecret, marketplaceId, vendorPublicKey: vendor.publicKey })).txHash,
  );

  console.log("3. Purchase with no open period...");
  await expectRejected("purchase before any period", "NoActivePeriod", () =>
    purchase({
      buyerSecret,
      marketplaceId,
      vendorPublicKey: vendor.publicKey,
      amountStroops: usdToStroops(10),
    }),
  );

  console.log(`4. Opening period: A 50% / B 30% / C 20%, ${PERIOD_SECONDS}s long...`);
  const { ledgerTime } = await getRewardsStatus(marketplaceId);
  const endTs = ledgerTime + PERIOD_SECONDS;
  const opened = await openRewardsPeriod({
    operatorSecret,
    marketplaceId,
    beneficiaries: [memberA.publicKey, memberB.publicKey, memberC.publicKey],
    sharesBps: [5_000, 3_000, 2_000],
    endTs,
  });
  const periodId = opened.periodId;
  recordTx(`open_period (period ${periodId})`, opened.txHash);

  console.log("5. Two purchases ($42.00 and $18.50)...");
  for (const amount of [42, 18.5]) {
    const result = await purchase({
      buyerSecret,
      marketplaceId,
      vendorPublicKey: vendor.publicKey,
      amountStroops: usdToStroops(amount),
    });
    recordTx(`purchase $${amount.toFixed(2)} → booked to period ${result.rewardsPeriodId}`, result.txHash);
  }
  const running = await getRewardsPeriod(marketplaceId, periodId);
  console.log(`    period total on-chain: ${usd(stroopsToUsd(running.totalContributedStroops))} (expected $3.025)`);

  console.log("6. Things that must fail while the period runs...");
  await expectRejected("close before end", "PeriodNotEnded", () =>
    closeRewardsPeriod({ signerSecret: operatorSecret, marketplaceId, periodId }),
  );
  await expectRejected("claim before close", "PeriodNotClosed", () =>
    claimReward({ memberSecret: decryptSecret(memberA.secretEncrypted), marketplaceId, periodId }),
  );
  for (const kind of ["change-rules", "withdraw"] as const) {
    const result = await simulateForbiddenAction({
      kind,
      operatorPublicKey: operator.publicKey,
      marketplaceId,
      amountStroops: running.totalContributedStroops,
    });
    if (!result.rejected) throw new Error(`SECURITY CHECK FAILED: operator ${kind} was accepted`);
    rejections.push({ step: `operator ${kind} (control: ${result.control})`, reason: result.reason });
    console.log(`    ✔ rejected as expected: operator ${kind} → ${result.reason} (control: ${result.control})`);
  }

  console.log("7. Waiting for the ledger to pass the period end...");
  for (;;) {
    const { ledgerTime: now } = await getRewardsStatus(marketplaceId);
    if (now >= endTs) break;
    process.stdout.write(`    ${endTs - now}s left\r`);
    await sleep(5_000);
  }
  const closed = await closeRewardsPeriod({ signerSecret: operatorSecret, marketplaceId, periodId });
  recordTx(`close_period (total ${usd(stroopsToUsd(closed.totalStroops))})`, closed.txHash);

  const entitlements = await getRewardsEntitlements(marketplaceId, periodId);
  for (const [label, member] of [
    ["A", memberA],
    ["B", memberB],
    ["C", memberC],
  ] as const) {
    const ent = entitlements.find((e) => e.member === member.publicKey);
    const claimed = await claimReward({
      memberSecret: decryptSecret(member.secretEncrypted),
      marketplaceId,
      periodId,
    });
    recordTx(
      `claim member ${label} (${(ent?.shareBps ?? 0) / 100}% → ${usd(stroopsToUsd(claimed.amountStroops))})`,
      claimed.txHash,
    );
  }
  await expectRejected("second claim by member A", "AlreadyClaimed", () =>
    claimReward({ memberSecret: decryptSecret(memberA.secretEncrypted), marketplaceId, periodId }),
  );

  const [vendorBal, operatorBal, aBal, bBal, cBal, status] = await Promise.all([
    getUsdBalance(vendor.publicKey),
    getUsdBalance(operator.publicKey),
    getUsdBalance(memberA.publicKey),
    getUsdBalance(memberB.publicKey),
    getUsdBalance(memberC.publicKey),
    getRewardsStatus(marketplaceId),
  ]);

  console.log("────────────────────────────────────────────────────────");
  console.log(`vendor    ${usd(vendorBal)}  (expected $54.45)`);
  console.log(`operator  ${usd(operatorBal)}  (expected $3.025)`);
  console.log(`member A  ${usd(aBal)}  (expected $1.5125)`);
  console.log(`member B  ${usd(bBal)}  (expected $0.9075)`);
  console.log(`member C  ${usd(cBal)}  (expected $0.605)`);
  console.log(
    `treasury  contributed ${usd(stroopsToUsd(status.totalContributedStroops))}, claimed ${usd(stroopsToUsd(status.totalClaimedStroops))}`,
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
