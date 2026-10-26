// Rewards distributions and the community scheduler.
//
// A rewards period ends with `distribute`, which the contract accepts from
// anyone once the period's length has passed. The API submits it as soon as a
// period is due — right on time, from a timer — so nobody has to remember. No
// signature is needed (the demo-asset issuer pays the fee): next-period rules
// the operator scheduled in the dashboard are already on-chain, and the
// contract applies them.
// The same timer also releases fundraising rounds whose automatic release
// after a sale didn't go through, and keeps the contract's code and instance
// from expiring (see src/lib/stellar/ttl.ts), so their rent never lands on a
// buyer's transaction.

import { prisma } from "@/lib/db";
import { releaseIfReached } from "@/lib/fundraise";
import { boundOnChainId } from "@/lib/rewards";
import {
  ContractError,
  distributeRewards,
  getFundraise,
  getRewardsStatus,
  keepContractAlive,
  stellarConfig,
  stroopsToUsd,
} from "@/lib/stellar";

const marketplaceSelect = {
  id: true,
  slug: true,
  contractMarketplaceId: true,
  contractId: true,
  rewardsNextVendorPoolBps: true,
  rewardsNextPeriodSeconds: true,
} as const;

type DistributableMarketplace = {
  id: string;
  contractMarketplaceId: string | null;
  contractId: string | null;
  rewardsNextVendorPoolBps: number | null;
  rewardsNextPeriodSeconds: number | null;
};

/**
 * Distributes the current period if it is due. Returns null when it isn't
 * (including a concurrent distribution winning the race).
 */
export async function distributeIfDue(
  marketplace: DistributableMarketplace,
): Promise<{ periodId: number; amountUsd: number; txHash: string } | null> {
  const onChainId = boundOnChainId(marketplace);
  if (onChainId === null) return null;
  const status = await getRewardsStatus(onChainId);
  if (status.ledgerTime < status.periodEnd) return null;

  // The operator schedules the next rules on-chain (set_next_rules), so the
  // distribution needs no signature and the contract applies them.
  let result;
  try {
    result = await distributeRewards({ signerSecret: stellarConfig.usdcIssuerSecret, marketplaceId: onChainId, next: null });
  } catch (error) {
    if (error instanceof ContractError && error.errorName === "PeriodNotEnded") return null;
    throw error;
  }

  const amountUsd = stroopsToUsd(result.poolStroops);
  try {
    await prisma.$transaction([
      prisma.rewardsDistribution.create({
        data: {
          marketplaceId: marketplace.id,
          contractId: stellarConfig.marketplaceContractId,
          periodId: status.currentPeriod,
          amountUsd,
          txHash: result.txHash,
        },
      }),
      // The pending rules are now the contract's; clear them.
      prisma.marketplace.update({
        where: { id: marketplace.id },
        data: { rewardsNextVendorPoolBps: null, rewardsNextPeriodSeconds: null },
      }),
    ]);
  } catch (dbError) {
    console.error("[rewards] distribution confirmed on-chain but not recorded:", result.txHash, dbError);
  }
  return { periodId: status.currentPeriod, amountUsd, txHash: result.txHash };
}

/** Loads a marketplace with what distributeIfDue needs. */
export function loadDistributable(where: { id: string } | { slug: string }) {
  return prisma.marketplace.findUnique({ where, select: marketplaceSelect });
}

let running = false;

/** One scheduler pass over every bound rewards and fundraising marketplace. */
export async function runCommunityTick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    try {
      const extended = await keepContractAlive();
      if (extended) console.log(`[community] extended the contract's TTL (${extended.feeXlm.toFixed(2)} XLM) · ${extended.txHash}`);
    } catch (error) {
      console.error("[community] could not extend the contract's TTL:", error);
    }
    const contractId = stellarConfig.marketplaceContractId;
    const due = await prisma.marketplace.findMany({
      where: { communityMode: "rewards", contractId, contractMarketplaceId: { not: null } },
      select: marketplaceSelect,
    });
    for (const m of due) {
      try {
        const done = await distributeIfDue(m);
        if (done) console.log(`[rewards] distributed ${m.slug} period ${done.periodId + 1}: $${done.amountUsd}`);
      } catch (error) {
        console.error(`[rewards] distribution of ${m.slug} failed:`, error);
      }
    }
    const fundraisers = await prisma.marketplace.findMany({
      where: { communityMode: "fundraise", contractId, contractMarketplaceId: { not: null } },
      select: {
        id: true,
        slug: true,
        contractMarketplaceId: true,
        contractId: true,
        fundraiseNextTargetUsd: true,
      },
    });
    for (const m of fundraisers) {
      try {
        const state = await getFundraise(BigInt(m.contractMarketplaceId as string));
        if (!state.collecting || state.raisedStroops <= 0n || state.raisedStroops < state.targetStroops) continue;
        const done = await releaseIfReached(m);
        if (done) console.log(`[fundraise] released ${m.slug} round ${done.round + 1}: $${done.amountUsd}`);
      } catch (error) {
        console.error(`[fundraise] release of ${m.slug} failed:`, error);
      }
    }
  } finally {
    running = false;
  }
}

/**
 * Starts the scheduler (every COMMUNITY_TICK_SECONDS, default 30). Disable
 * with COMMUNITY_SCHEDULER=off, e.g. when several API instances share a
 * database (one is enough; duplicates are harmless but cost fees).
 */
export function startCommunityScheduler(): void {
  if (process.env.COMMUNITY_SCHEDULER === "off") return;
  const seconds = Math.max(5, Number(process.env.COMMUNITY_TICK_SECONDS ?? 30));
  const tick = () =>
    void runCommunityTick().catch((error) => console.error("[community] scheduler tick failed:", error));
  setTimeout(tick, 5_000);
  setInterval(tick, seconds * 1_000);
}
