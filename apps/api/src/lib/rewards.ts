// Community Rewards read model.
//
// Source of truth split, kept explicit in every payload:
//   - Confirmed on-chain state (read from the Soroban contract on every
//     request): rules, current period, period pools and volumes, treasury
//     totals, each participant's reward and claim status, ledger time.
//   - Auxiliary off-chain data (Postgres): which sales fed which period (and
//     so who took part), display names for addresses, and claim tx hashes.
// Per-participant amounts in the public view are estimates computed from the
// on-chain pools; a participant's own claimable amount is always read from
// the contract (getReward) before it is claimed.

import { parseSplitSnapshot, prisma } from "@/lib/db";
import {
  ContractError,
  getPeriodTotals,
  getRewardsStatus,
  stellarConfig,
  stellarExpertContractUrl,
  stroopsToUsd,
  usdToStroops,
} from "@/lib/stellar";

/** History shown per marketplace (most recent periods with activity). */
export const PERIOD_HISTORY_LIMIT = 12;

export type CommunityMode = "classic" | "rewards" | "fundraise";

export function communityModeOf(marketplace: { communityMode: string }): CommunityMode {
  return marketplace.communityMode === "rewards" || marketplace.communityMode === "fundraise"
    ? marketplace.communityMode
    : "classic";
}

/**
 * The marketplace's on-chain id, but only if it was registered in the
 * contract this API is configured for. Ids from another deployment would
 * point at a different marketplace, so they are treated as "not bound".
 */
export function boundOnChainId(marketplace: {
  contractMarketplaceId: string | null;
  contractId: string | null;
}): bigint | null {
  if (!marketplace.contractMarketplaceId) return null;
  if (marketplace.contractId !== stellarConfig.marketplaceContractId) return null;
  return BigInt(marketplace.contractMarketplaceId);
}

/** Display names for Stellar addresses (own wallets and custodial accounts). */
export async function namesOf(addresses: string[]): Promise<Map<string, string>> {
  if (addresses.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { OR: [{ stellarPublicKey: { in: addresses } }, { walletAddress: { in: addresses } }] },
    select: { name: true, stellarPublicKey: true, walletAddress: true },
  });
  return new Map(
    users.flatMap((u) =>
      [u.stellarPublicKey, u.walletAddress].filter(Boolean).map((a) => [a as string, u.name] as const),
    ),
  );
}

export interface ParticipantView {
  address: string;
  name: string | null;
  soldUsd: number;
  boughtUsd: number;
  /** Share of the on-chain pools by this participant's recorded volume. */
  estimatedUsd: number;
  claimedUsd: number | null;
  claimTxHash: string | null;
}

export interface PeriodView {
  periodId: number;
  startTs: number;
  /** When it was distributed; for the current period, when it becomes due. */
  endTs: number;
  /** "current": still collecting; "ended": distributed, rewards can be claimed. */
  status: "current" | "ended";
  vendorPoolBps: number;
  vendorPoolUsd: number;
  buyerPoolUsd: number;
  salesUsd: number;
  claimedUsd: number;
  salesCount: number;
  participants: ParticipantView[];
  distributionTxHash: string | null;
}

export interface RewardsView {
  enabled: boolean;
  /** False when the marketplace isn't registered in the configured contract. */
  bound: boolean;
  contractId: string;
  contractUrl: string;
  /** Code of the self-issued testnet demo asset (never Circle USDC). */
  assetCode: string;
  communityBps: number;
  /** The running period's rules (from the contract). */
  periodSeconds: number | null;
  vendorPoolBps: number | null;
  buyerPoolBps: number | null;
  currentPeriod: number | null;
  periodStart: number | null;
  /** The running period can be distributed from this time on. */
  periodEnd: number | null;
  /** The running period is past its end and waiting to be distributed. */
  distributionDue: boolean;
  /** Rules the operator set for the next period (null = keep the current ones). */
  nextRules: { vendorPoolBps: number; periodSeconds: number } | null;
  ledgerTime: number | null;
  treasury: { contributedUsd: number; claimedUsd: number; heldUsd: number } | null;
  periods: PeriodView[];
}

/** The operator's pending rules for the next period, if any. */
export function nextRulesOf(m: {
  rewardsNextVendorPoolBps: number | null;
  rewardsNextPeriodSeconds: number | null;
}): { vendorPoolBps: number; periodSeconds: number } | null {
  if (m.rewardsNextVendorPoolBps === null || m.rewardsNextPeriodSeconds === null) return null;
  return { vendorPoolBps: m.rewardsNextVendorPoolBps, periodSeconds: m.rewardsNextPeriodSeconds };
}

/** Mirrors the contract's floor division (reward_of). */
function shareOf(pool: bigint, mine: bigint, all: bigint): bigint {
  return mine === 0n || all === 0n ? 0n : (pool * mine) / all;
}

/**
 * Loads the rewards view of one marketplace from the contract, joined with
 * who took part (from recorded sales), names and claim tx hashes.
 */
export async function loadRewardsView(marketplace: {
  id: string;
  communityMode: string;
  splitCommunityBps: number;
  rewardsPeriodSeconds: number | null;
  rewardsVendorPoolBps: number | null;
  rewardsNextVendorPoolBps: number | null;
  rewardsNextPeriodSeconds: number | null;
  contractMarketplaceId: string | null;
  contractId: string | null;
}): Promise<RewardsView> {
  const contractId = stellarConfig.marketplaceContractId;
  const base: RewardsView = {
    enabled: communityModeOf(marketplace) === "rewards",
    bound: false,
    contractId,
    contractUrl: stellarExpertContractUrl(contractId),
    assetCode: stellarConfig.usdcCode,
    communityBps: marketplace.splitCommunityBps,
    periodSeconds: marketplace.rewardsPeriodSeconds,
    vendorPoolBps: marketplace.rewardsVendorPoolBps,
    buyerPoolBps:
      marketplace.rewardsVendorPoolBps === null ? null : 10_000 - marketplace.rewardsVendorPoolBps,
    currentPeriod: null,
    periodStart: null,
    periodEnd: null,
    distributionDue: false,
    nextRules: nextRulesOf(marketplace),
    ledgerTime: null,
    treasury: null,
    periods: [],
  };
  const onChainId = boundOnChainId(marketplace);
  if (!base.enabled || onChainId === null) return base;

  const [status, sales, claims, distributions] = await Promise.all([
    getRewardsStatus(onChainId),
    prisma.sale.findMany({
      where: { product: { marketplaceId: marketplace.id } },
      select: { amountUsd: true, splitSnapshot: true },
      orderBy: { createdAt: "desc" },
      take: 1_000,
    }),
    prisma.rewardClaim.findMany({ where: { marketplaceId: marketplace.id, contractId } }),
    prisma.rewardsDistribution.findMany({ where: { marketplaceId: marketplace.id, contractId } }),
  ]);
  const distributionTx = new Map(distributions.map((d) => [d.periodId, d.txHash]));

  // Who sold and bought in each period, by on-chain address.
  type Volume = { sold: bigint; bought: bigint };
  const byPeriod = new Map<number, { count: number; volumes: Map<string, Volume> }>();
  for (const sale of sales) {
    let snapshot;
    try {
      snapshot = parseSplitSnapshot(sale.splitSnapshot);
    } catch {
      continue;
    }
    const k = snapshot.rewardsPeriodId;
    if (k === undefined || k === null) continue;
    const entry = byPeriod.get(k) ?? { count: 0, volumes: new Map<string, Volume>() };
    entry.count += 1;
    const amount = usdToStroops(sale.amountUsd);
    const add = (address: string | undefined, side: keyof Volume) => {
      if (!address) return;
      const v = entry.volumes.get(address) ?? { sold: 0n, bought: 0n };
      v[side] += amount;
      entry.volumes.set(address, v);
    };
    add(snapshot.vendorAddress, "sold");
    add(snapshot.buyerAddress, "bought");
    byPeriod.set(k, entry);
  }

  const ids = [...new Set([status.currentPeriod, ...byPeriod.keys()])]
    .filter((k) => k <= status.currentPeriod)
    .sort((a, b) => b - a)
    .slice(0, PERIOD_HISTORY_LIMIT);
  const totals = await Promise.all(ids.map((k) => getPeriodTotals(onChainId, k)));
  const names = await namesOf([...new Set([...byPeriod.values()].flatMap((p) => [...p.volumes.keys()]))]);
  const claimOf = new Map(claims.map((c) => [`${c.periodId}:${c.memberAddress}`, c]));

  const periods: PeriodView[] = ids.map((k, i) => {
    const t = totals[i];
    const activity = byPeriod.get(k);
    const participants: ParticipantView[] = [...(activity?.volumes ?? new Map<string, Volume>())]
      .map(([address, v]) => {
        const claim = claimOf.get(`${k}:${address}`);
        const estimate =
          shareOf(t.vendorPoolStroops, v.sold, t.vendorVolumeStroops) +
          shareOf(t.buyerPoolStroops, v.bought, t.buyerVolumeStroops);
        return {
          address,
          name: names.get(address) ?? null,
          soldUsd: stroopsToUsd(v.sold),
          boughtUsd: stroopsToUsd(v.bought),
          estimatedUsd: stroopsToUsd(estimate),
          claimedUsd: claim?.amountUsd ?? null,
          claimTxHash: claim?.txHash ?? null,
        };
      })
      .sort((a, b) => b.estimatedUsd - a.estimatedUsd);
    return {
      periodId: k,
      startTs: t.startTs,
      endTs: t.distributed ? t.endTs : status.periodEnd,
      status: t.distributed ? "ended" : "current",
      vendorPoolBps: t.vendorPoolBps,
      vendorPoolUsd: stroopsToUsd(t.vendorPoolStroops),
      buyerPoolUsd: stroopsToUsd(t.buyerPoolStroops),
      salesUsd: stroopsToUsd(t.vendorVolumeStroops),
      claimedUsd: stroopsToUsd(t.totalClaimedStroops),
      salesCount: activity?.count ?? 0,
      participants,
      distributionTxHash: distributionTx.get(k) ?? null,
    };
  });

  return {
    ...base,
    bound: true,
    periodSeconds: status.periodSeconds,
    vendorPoolBps: status.vendorPoolBps,
    buyerPoolBps: status.buyerPoolBps,
    currentPeriod: status.currentPeriod,
    periodStart: status.periodStart,
    periodEnd: status.periodEnd,
    distributionDue: status.ledgerTime >= status.periodEnd,
    ledgerTime: status.ledgerTime,
    treasury: {
      contributedUsd: stroopsToUsd(status.totalContributedStroops),
      claimedUsd: stroopsToUsd(status.totalClaimedStroops),
      heldUsd: stroopsToUsd(status.totalContributedStroops - status.totalClaimedStroops),
    },
    periods,
  };
}

/**
 * User-facing message + HTTP status for a contract rejection, or null when
 * the error isn't a recognised contract rejection.
 */
export function describeContractError(
  error: unknown,
): { status: 400 | 403 | 409; message: string; code: string } | null {
  if (!(error instanceof ContractError)) return null;
  const known: Record<string, [400 | 403 | 409, string]> = {
    PeriodNotFound: [409, "That rewards period hasn't started yet."],
    PeriodNotEnded: [409, "This period hasn't been distributed yet; rewards can be claimed after the distribution."],
    AlreadyClaimed: [409, "This reward was already claimed."],
    NothingToClaim: [409, "There is nothing to claim for this period."],
    RewardsNotEnabled: [400, "Community Rewards is not enabled for this marketplace."],
    FundraiseNotEnabled: [400, "This marketplace has no fundraising target."],
    GoalNotReached: [409, "The fundraising target hasn't been reached yet."],
    InvalidRecipients: [400, "The contract rejected the recipient list."],
    InvalidRewardsConfig: [400, "The contract rejected the rewards rules."],
    InvalidGoal: [400, "The contract rejected the fundraising target."],
    Unauthorized: [403, "The contract rejected the authorization."],
  };
  const entry = known[error.errorName];
  if (!entry) return null;
  return { status: entry[0], message: entry[1], code: error.errorName };
}
