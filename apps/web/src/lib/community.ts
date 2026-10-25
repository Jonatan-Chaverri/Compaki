import type { CommunityMode, FundraiseView, RewardsView } from "./rewards";

export interface CommunityDetails {
  communityPurpose: string;
  communityBeneficiaries: string;
  communityDistribution: string;
  communityGoalUsd: number | null;
}
export interface CommunityDraft {
  communityPurpose: string;
  communityBeneficiaries: string;
  communityDistribution: string;
  communityGoalUsd: string;
}
export const emptyCommunityDraft: CommunityDraft = { communityPurpose: "", communityBeneficiaries: "", communityDistribution: "", communityGoalUsd: "" };
export function communityDraft(details: CommunityDetails): CommunityDraft {
  return { ...details, communityGoalUsd: details.communityGoalUsd === null ? "" : String(details.communityGoalUsd) };
}
export function goalValid(raw: string): boolean {
  const goal = Number(raw);
  return Number.isFinite(goal) && goal > 0 && goal <= 1_000_000_000 && Math.abs(goal * 100 - Math.round(goal * 100)) < 0.00001;
}
/**
 * Classic funds need the organizer to explain how money is shared; rewards
 * and fundraising rules are enforced by the contract, so that text is
 * optional there, and a fundraiser's target is set (and validated) with its
 * rules instead.
 */
export function communityDraftValid(value: CommunityDraft, mode: CommunityMode = "classic"): boolean {
  const distribution = value.communityDistribution.trim().length;
  return value.communityPurpose.trim().length >= 20 && value.communityPurpose.trim().length <= 2000 &&
    value.communityBeneficiaries.trim().length >= 10 && value.communityBeneficiaries.trim().length <= 2000 &&
    (mode === "classic" ? distribution >= 20 : true) && distribution <= 4000 &&
    (mode === "fundraise" || value.communityGoalUsd === "" || goalValid(value.communityGoalUsd));
}
export function communitySubmission(value: CommunityDraft): CommunityDetails {
  return { ...value, communityGoalUsd: value.communityGoalUsd === "" ? null : Number(value.communityGoalUsd) };
}
export interface CommunityPayload {
  marketplace: CommunityDetails & {
    name: string; slug: string; regenerativeEnabled: boolean; communityMode: CommunityMode;
    communityDetailsUpdatedAt: string | null;
    splits: { vendorBps: number; operatorBps: number; communityBps: number };
    operator: { name: string; address: string | null };
    communityFund: { name: string; address: string | null } | null;
    sellers: { name: string; address: string | null }[];
  };
  canManage: boolean;
  sales: { salesCount: number; grossUsd: number; vendorUsd: number; operatorUsd: number; communityUsd: number; unclassifiedSales: number };
  communityBalanceUsd: number | null;
  rewards: RewardsView | null;
  fundraise: FundraiseView | null;
  verificationError: string | null;
  verifiedAt: string;
  historyLimit: number;
}

/** Keep money held now separate from lifetime contributions and the next period. */
export function communityFundSummary(data: CommunityPayload) {
  const mode = data.marketplace.communityMode;
  const rewards = mode === "rewards" && data.rewards?.bound ? data.rewards : null;
  const fundraise = mode === "fundraise" && data.fundraise?.bound ? data.fundraise : null;
  const period = rewards?.periods.find(p => p.status === "current" && p.periodId === rewards.currentPeriod) ?? null;
  const balanceUsd = mode === "rewards" ? rewards?.treasury?.heldUsd ?? null
    : mode === "fundraise" ? fundraise ? Math.max(0, fundraise.totalRaisedUsd - fundraise.totalReleasedUsd) : null
    : data.communityBalanceUsd;
  const nextPoolUsd = period ? period.vendorPoolUsd + period.buyerPoolUsd : null;
  return {
    balanceUsd,
    nextPoolUsd,
    previousUnclaimedUsd: balanceUsd !== null && nextPoolUsd !== null ? Math.max(0, balanceUsd - nextPoolUsd) : null,
    period,
    rewards,
    fundraise,
  };
}
