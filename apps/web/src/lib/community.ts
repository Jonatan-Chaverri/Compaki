import type { RewardsView } from "./rewards";

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
export function communityDraftValid(value: CommunityDraft): boolean {
  const goal = Number(value.communityGoalUsd);
  return value.communityPurpose.trim().length >= 20 && value.communityPurpose.trim().length <= 2000 &&
    value.communityBeneficiaries.trim().length >= 10 && value.communityBeneficiaries.trim().length <= 2000 &&
    value.communityDistribution.trim().length >= 20 && value.communityDistribution.trim().length <= 4000 &&
    (value.communityGoalUsd === "" || (Number.isFinite(goal) && goal > 0 && goal <= 1_000_000_000 && Math.abs(goal * 100 - Math.round(goal * 100)) < 0.00001));
}
export function communitySubmission(value: CommunityDraft): CommunityDetails {
  return { ...value, communityGoalUsd: value.communityGoalUsd === "" ? null : Number(value.communityGoalUsd) };
}
export interface CommunityPayload {
  marketplace: CommunityDetails & {
    name: string; slug: string; regenerativeEnabled: boolean; rewardsEnabled: boolean;
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
  verificationError: string | null;
  verifiedAt: string;
  historyLimit: number;
}
