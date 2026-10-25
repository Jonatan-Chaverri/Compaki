// Fundraising read model and release.
//
// The rules (target, recipients, shares, what happens after the target) and
// the progress are read from the contract on every request; Postgres adds
// recipient labels, names and release tx hashes. Releasing needs no
// authorization on-chain: once a round reaches its target anyone may submit
// it, and the API does so right after the sale that reached it (the
// demo-asset issuer account pays the network fee).

import { prisma } from "@/lib/db";
import { boundOnChainId, communityModeOf, namesOf } from "@/lib/rewards";
import {
  ContractError,
  getFundraise,
  releaseFundraise,
  stellarConfig,
  stellarExpertContractUrl,
  stellarExpertTxUrl,
  stroopsToUsd,
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
  /** True while sales still add to a round (false after a Stop / Direct goal). */
  collecting: boolean;
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
    collecting: !state.goalReached || state.policy === "new-round",
    releasable: state.raisedStroops > 0n && state.raisedStroops >= state.targetStroops,
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
}): Promise<{ round: number; amountUsd: number; txHash: string } | null> {
  const onChainId = boundOnChainId(marketplace);
  if (onChainId === null) return null;
  const state = await getFundraise(onChainId);
  if (state.raisedStroops <= 0n || state.raisedStroops < state.targetStroops) return null;
  let released;
  try {
    released = await releaseFundraise({
      signerSecret: stellarConfig.usdcIssuerSecret,
      marketplaceId: onChainId,
    });
  } catch (error) {
    if (error instanceof ContractError && error.errorName === "GoalNotReached") return null;
    throw error;
  }
  const amountUsd = stroopsToUsd(released.amountStroops);
  try {
    await prisma.fundraiseRelease.create({
      data: {
        marketplaceId: marketplace.id,
        contractId: stellarConfig.marketplaceContractId,
        round: state.round,
        amountUsd,
        txHash: released.txHash,
      },
    });
  } catch (dbError) {
    console.error("[fundraise] release confirmed on-chain but not recorded:", released.txHash, dbError);
  }
  return { round: state.round, amountUsd, txHash: released.txHash };
}
