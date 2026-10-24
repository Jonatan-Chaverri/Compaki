// Community Rewards read model.
//
// Source of truth split, kept explicit in every payload:
//   - Confirmed on-chain state (read from the Soroban contract on every
//     request): treasury totals, periods, beneficiaries, shares, entitlements,
//     claim status, ledger time.
//   - Auxiliary off-chain data (Postgres): transaction hashes for explorer
//     links, display names for addresses, and which sales fed which period.
// Nothing here derives a balance or a claim right from Postgres.

import { parseSplitSnapshot, prisma } from "@/lib/db";
import {
  ContractError,
  getRewardsEntitlements,
  getRewardsPeriod,
  getRewardsStatus,
  stellarConfig,
  stellarExpertContractUrl,
  stroopsToUsd,
} from "@/lib/stellar";

/** History shown per marketplace (most recent periods). */
export const PERIOD_HISTORY_LIMIT = 12;

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

export type PeriodStatus = "active" | "ended" | "closed";

export interface BeneficiaryView {
  address: string;
  name: string | null;
  shareBps: number;
  /** Share of the current period total; final only once the period closes. */
  projectedUsd: number;
  /** Final on-chain entitlement (closed periods only). */
  amountUsd: number | null;
  claimed: boolean | null;
  claimTxHash: string | null;
}

export interface PeriodView {
  periodId: number;
  startTs: number;
  endTs: number;
  status: PeriodStatus;
  totalUsd: number;
  claimedUsd: number;
  beneficiaries: BeneficiaryView[];
  openTxHash: string | null;
  closeTxHash: string | null;
  /** Sales whose community share was booked to this period (off-chain index). */
  contributions: { saleId: string; txHash: string; communityUsd: number; createdAt: string }[];
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
  ledgerTime: number | null;
  treasury: { contributedUsd: number; claimedUsd: number; heldUsd: number } | null;
  periodCount: number;
  periods: PeriodView[];
}

export function periodStatus(period: { closed: boolean; endTs: number }, ledgerTime: number): PeriodStatus {
  if (period.closed) return "closed";
  return ledgerTime >= period.endTs ? "ended" : "active";
}

/** Projected share in stroops, mirroring the contract's floor division. */
function projectedStroops(total: bigint, shareBps: number): bigint {
  return (total * BigInt(shareBps)) / 10_000n;
}

/**
 * Loads the full rewards view of one marketplace from the contract, joined
 * with auxiliary tx hashes / names from Postgres.
 */
export async function loadRewardsView(marketplace: {
  id: string;
  rewardsEnabled: boolean;
  splitCommunityBps: number;
  contractMarketplaceId: string | null;
  contractId: string | null;
}): Promise<RewardsView> {
  const contractId = stellarConfig.marketplaceContractId;
  const base: RewardsView = {
    enabled: marketplace.rewardsEnabled,
    bound: false,
    contractId,
    contractUrl: stellarExpertContractUrl(contractId),
    assetCode: stellarConfig.usdcCode,
    communityBps: marketplace.splitCommunityBps,
    ledgerTime: null,
    treasury: null,
    periodCount: 0,
    periods: [],
  };
  const onChainId = boundOnChainId(marketplace);
  if (!marketplace.rewardsEnabled || onChainId === null) return base;

  const status = await getRewardsStatus(onChainId);
  const firstId = Math.max(0, status.periodCount - PERIOD_HISTORY_LIMIT);
  const ids = Array.from({ length: status.periodCount - firstId }, (_, i) => firstId + i);

  const periods = await Promise.all(
    ids.map(async (periodId) => {
      const period = await getRewardsPeriod(onChainId, periodId);
      const entitlements = period.closed
        ? await getRewardsEntitlements(onChainId, periodId)
        : null;
      return { period, entitlements };
    }),
  );

  const addresses = [...new Set(periods.flatMap((p) => p.period.beneficiaries))];
  const [users, auxPeriods, sales] = await Promise.all([
    prisma.user.findMany({
      where: { OR: [{ stellarPublicKey: { in: addresses } }, { cavosAddress: { in: addresses } }] },
      select: { name: true, stellarPublicKey: true, cavosAddress: true },
    }),
    prisma.rewardsPeriod.findMany({
      where: { marketplaceId: marketplace.id, contractId, periodId: { in: ids } },
      include: { claims: true },
    }),
    prisma.sale.findMany({
      where: { product: { marketplaceId: marketplace.id } },
      select: { id: true, txHash: true, splitSnapshot: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);
  const nameOf = new Map(
    users.flatMap((u) => [u.stellarPublicKey, u.cavosAddress].filter(Boolean).map((a) => [a, u.name] as const)),
  );
  const auxOf = new Map(auxPeriods.map((p) => [p.periodId, p]));

  const contributionsOf = new Map<number, PeriodView["contributions"]>();
  for (const sale of sales) {
    let snapshot;
    try {
      snapshot = parseSplitSnapshot(sale.splitSnapshot);
    } catch {
      continue;
    }
    if (snapshot.rewardsPeriodId === undefined || snapshot.rewardsPeriodId === null) continue;
    const list = contributionsOf.get(snapshot.rewardsPeriodId) ?? [];
    list.push({
      saleId: sale.id,
      txHash: sale.txHash,
      communityUsd: snapshot.communityAmountUsd,
      createdAt: sale.createdAt.toISOString(),
    });
    contributionsOf.set(snapshot.rewardsPeriodId, list);
  }

  const views: PeriodView[] = periods.map(({ period, entitlements }) => {
    const aux = auxOf.get(period.periodId);
    const claimTx = new Map(aux?.claims.map((c) => [c.memberAddress, c.txHash]) ?? []);
    return {
      periodId: period.periodId,
      startTs: period.startTs,
      endTs: period.endTs,
      status: periodStatus(period, status.ledgerTime),
      totalUsd: stroopsToUsd(period.totalContributedStroops),
      claimedUsd: stroopsToUsd(period.totalClaimedStroops),
      openTxHash: aux?.openTxHash ?? null,
      closeTxHash: aux?.closeTxHash ?? null,
      contributions: contributionsOf.get(period.periodId) ?? [],
      beneficiaries: period.beneficiaries.map((address, i) => {
        const entitlement = entitlements?.[i];
        return {
          address,
          name: nameOf.get(address) ?? null,
          shareBps: period.sharesBps[i],
          projectedUsd: stroopsToUsd(
            projectedStroops(period.totalContributedStroops, period.sharesBps[i]),
          ),
          amountUsd: entitlement ? stroopsToUsd(entitlement.amountStroops) : null,
          claimed: entitlement ? entitlement.claimed : null,
          claimTxHash: claimTx.get(address) ?? null,
        };
      }),
    };
  });

  return {
    ...base,
    bound: true,
    ledgerTime: status.ledgerTime,
    periodCount: status.periodCount,
    treasury: {
      contributedUsd: stroopsToUsd(status.totalContributedStroops),
      claimedUsd: stroopsToUsd(status.totalClaimedStroops),
      heldUsd: stroopsToUsd(status.totalContributedStroops - status.totalClaimedStroops),
    },
    periods: views.reverse(),
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
    NoActivePeriod: [
      409,
      "This marketplace's Community Rewards period isn't open, so checkout is paused until the operator opens a new period.",
    ],
    PeriodActive: [409, "A period is still running — its rules are locked until it ends."],
    PeriodNotEnded: [409, "This period hasn't reached its end time on-chain yet."],
    PeriodAlreadyClosed: [409, "This period is already closed."],
    PeriodNotClosed: [409, "Rewards can be claimed once the period is closed."],
    NotBeneficiary: [403, "You are not a beneficiary of this period."],
    AlreadyClaimed: [409, "This reward was already claimed."],
    NothingToClaim: [409, "There is nothing to claim for this period."],
    InvalidBeneficiaries: [400, "The contract rejected the beneficiary list."],
    InvalidPeriodEnd: [400, "The contract rejected the period end date."],
    RewardsNotEnabled: [400, "Community Rewards is not enabled for this marketplace."],
    Unauthorized: [403, "The contract rejected the authorization."],
  };
  const entry = known[error.errorName];
  if (!entry) return null;
  return { status: entry[0], message: entry[1], code: error.errorName };
}
