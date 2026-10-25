// Fundraising read model and release.
//
// The rules (target, recipients, shares, what follows a payout) and the
// progress are read from the contract on every request; Postgres adds
// recipient labels, names, release tx hashes and the operator's pending
// next target. Once a round reaches its target the API releases it right
// after the sale that reached it (and the scheduler catches any it missed):
//   - with the operator's next target (0 = stop), signed by the operator's
//     custodial key, as the contract requires;
//   - otherwise with the policy's default, which anyone may submit (the
//     demo-asset issuer account pays the network fee).

import { prisma } from "@/lib/db";
import { operatorKeysSelect, operatorSignerOf } from "@/lib/operator";
import { boundOnChainId, communityModeOf, namesOf } from "@/lib/rewards";
import {
  ContractError,
  getFundraise,
  getNextTarget,
  releaseFundraise,
  stellarConfig,
  stellarExpertContractUrl,
  stellarExpertTxUrl,
  stroopsToUsd,
  usdToStroops,
  type GoalPolicy,
} from "@/lib/stellar";

/** Recipient row stored in Marketplace.fundraiseRecipients (a type, so it is valid Prisma JSON). */
export type FundraiseRecipient = {
  address: string;
  label: string;
  shareBps: number;
};

export function parseFundraiseRecipients(raw: unknown): FundraiseRecipient[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return typeof r.address === "string" && typeof r.shareBps === "number"
      ? [{ address: r.address, label: typeof r.label === "string" ? r.label : "", shareBps: r.shareBps }]
      : [];
  });
}

export interface FundraiseView {
  enabled: boolean;
  /** False when the marketplace isn't registered in the configured contract. */
  bound: boolean;
  contractId: string;
  contractUrl: string;
  assetCode: string;
  communityBps: number;
  targetUsd: number | null;
  policy: GoalPolicy | null;
  /** Current round (0-based) and what it has raised so far. */
  round: number | null;
  raisedUsd: number;
  totalRaisedUsd: number;
  totalReleasedUsd: number;
  goalReached: boolean;
  /** True while sales still add to a round (false once fundraising stopped). */
  collecting: boolean;
  /** Target the operator set for the next round (0 = stop; null = the policy's default). */
  nextTargetUsd: number | null;
  /** The current round reached its target and can be released now. */
  releasable: boolean;
  recipients: { address: string; label: string; name: string | null; shareBps: number }[];
  releases: { round: number; amountUsd: number; txHash: string; verifyUrl: string; createdAt: string }[];
}

type FundraiseMarketplace = {
  id: string;
  communityMode: string;
  splitCommunityBps: number;
  communityGoalUsd: number | null;
  fundraisePolicy: string | null;
  fundraiseRecipients: unknown;
  fundraiseNextTargetUsd: number | null;
  contractMarketplaceId: string | null;
  contractId: string | null;
};

export async function loadFundraiseView(marketplace: FundraiseMarketplace): Promise<FundraiseView> {
  const contractId = stellarConfig.marketplaceContractId;
  const stored = parseFundraiseRecipients(marketplace.fundraiseRecipients);
  const base: FundraiseView = {
    enabled: communityModeOf(marketplace) === "fundraise",
    bound: false,
    contractId,
    contractUrl: stellarExpertContractUrl(contractId),
    assetCode: stellarConfig.usdcCode,
    communityBps: marketplace.splitCommunityBps,
    targetUsd: marketplace.communityGoalUsd,
    policy: (marketplace.fundraisePolicy as GoalPolicy | null) ?? null,
    round: null,
    raisedUsd: 0,
    totalRaisedUsd: 0,
    totalReleasedUsd: 0,
    goalReached: false,
    collecting: true,
    nextTargetUsd: marketplace.fundraiseNextTargetUsd,
    releasable: false,
    recipients: stored.map((r) => ({ ...r, name: null })),
    releases: [],
  };
  const onChainId = boundOnChainId(marketplace);
  if (!base.enabled || onChainId === null) return base;

  const [state, releases] = await Promise.all([
    getFundraise(onChainId),
    prisma.fundraiseRelease.findMany({
      where: { marketplaceId: marketplace.id, contractId },
      orderBy: { round: "desc" },
    }),
  ]);
  const names = await namesOf(state.recipients);
  const labelOf = new Map(stored.map((r) => [r.address, r.label]));
  return {
    ...base,
    bound: true,
    targetUsd: stroopsToUsd(state.targetStroops),
    policy: state.policy,
    round: state.round,
    raisedUsd: stroopsToUsd(state.raisedStroops),
    totalRaisedUsd: stroopsToUsd(state.totalRaisedStroops),
    totalReleasedUsd: stroopsToUsd(state.totalReleasedStroops),
    goalReached: state.goalReached,
    collecting: state.collecting,
    releasable: state.collecting && state.raisedStroops > 0n && state.raisedStroops >= state.targetStroops,
    // Recipients and shares come from the contract; labels from Postgres.
    recipients: state.recipients.map((address, i) => ({
      address,
      label: labelOf.get(address) ?? "",
      name: names.get(address) ?? null,
      shareBps: state.sharesBps[i],
    })),
    releases: releases.map((r) => ({
      round: r.round,
      amountUsd: r.amountUsd,
      txHash: r.txHash,
      verifyUrl: stellarExpertTxUrl(r.txHash),
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/**
 * Releases the current round if it reached its target. Returns null when
 * there was nothing to release (including a concurrent release winning).
 */
export async function releaseIfReached(marketplace: {
  id: string;
  contractMarketplaceId: string | null;
  contractId: string | null;
  fundraiseNextTargetUsd: number | null;
  operatorAddress: string | null;
  operator: { stellarPublicKey: string | null; stellarSecretEncrypted: string | null };
}): Promise<{ round: number; amountUsd: number; txHash: string } | null> {
  const onChainId = boundOnChainId(marketplace);
  if (onChainId === null) return null;
  const state = await getFundraise(onChainId);
  if (!state.collecting || state.raisedStroops <= 0n || state.raisedStroops < state.targetStroops) return null;

  // The operator schedules the next target on-chain (set_next_target), so the
  // release needs no signature and the contract applies it. A target chosen
  // before that existed is only in Postgres: a custodial operator passes it.
  const nextTarget = marketplace.fundraiseNextTargetUsd;
  let legacyTarget: bigint | null = null;
  let signerSecret = stellarConfig.usdcIssuerSecret;
  if (nextTarget !== null && (await getNextTarget(onChainId)) === null) {
    const operator = operatorSignerOf(marketplace);
    if (operator?.kind === "custodial") {
      legacyTarget = usdToStroops(nextTarget);
      signerSecret = operator.secret;
    }
  }
  let released;
  try {
    released = await releaseFundraise({ signerSecret, marketplaceId: onChainId, nextTargetStroops: legacyTarget });
  } catch (error) {
    if (error instanceof ContractError && error.errorName === "GoalNotReached") return null;
    throw error;
  }
  const amountUsd = stroopsToUsd(released.amountStroops);
  try {
    await prisma.$transaction([
      prisma.fundraiseRelease.create({
        data: {
          marketplaceId: marketplace.id,
          contractId: stellarConfig.marketplaceContractId,
          round: state.round,
          amountUsd,
          txHash: released.txHash,
        },
      }),
      // The chosen next target is now the contract's; keep the mirror in sync.
      prisma.marketplace.update({
        where: { id: marketplace.id },
        data: {
          fundraiseNextTargetUsd: null,
          ...(nextTarget ? { communityGoalUsd: nextTarget } : {}),
        },
      }),
    ]);
  } catch (dbError) {
    console.error("[fundraise] release confirmed on-chain but not recorded:", released.txHash, dbError);
  }
  return { round: state.round, amountUsd, txHash: released.txHash };
}

/** releaseIfReached for a marketplace by id (loads the operator key it may need). */
export async function releaseIfReachedById(marketplaceId: string) {
  const marketplace = await prisma.marketplace.findUnique({
    where: { id: marketplaceId },
    select: {
      id: true,
      contractMarketplaceId: true,
      contractId: true,
      fundraiseNextTargetUsd: true,
      ...operatorKeysSelect,
    },
  });
  return marketplace ? releaseIfReached(marketplace) : null;
}
