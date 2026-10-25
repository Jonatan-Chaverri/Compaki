import type { UiTranslator } from "@/i18n/types";

// Community Rewards and fundraising payload types (mirrors of
// apps/api/src/lib/rewards.ts and fundraise.ts) and small display helpers
// shared by the operator panel, the community page and the rewards page.

export type CommunityMode = "classic" | "rewards" | "fundraise";
export type PeriodStatus = "current" | "ended";
export type GoalPolicy = "stop" | "new-round";

export interface ParticipantView {
  address: string;
  name: string | null;
  soldUsd: number;
  boughtUsd: number;
  estimatedUsd: number;
  claimedUsd: number | null;
  claimTxHash: string | null;
}

export interface PeriodView {
  periodId: number;
  startTs: number;
  /** When it was distributed; for the current period, when it becomes due. */
  endTs: number;
  status: PeriodStatus;
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
  bound: boolean;
  contractId: string;
  contractUrl: string;
  assetCode: string;
  communityBps: number;
  periodSeconds: number | null;
  vendorPoolBps: number | null;
  buyerPoolBps: number | null;
  currentPeriod: number | null;
  periodStart: number | null;
  /** The running period can be distributed from this time on. */
  periodEnd: number | null;
  distributionDue: boolean;
  /** Rules the operator scheduled for the next period (null = keep the current ones). */
  nextRules: { vendorPoolBps: number; periodSeconds: number } | null;
  ledgerTime: number | null;
  treasury: { contributedUsd: number; claimedUsd: number; heldUsd: number } | null;
  periods: PeriodView[];
}

export interface FundraiseView {
  enabled: boolean;
  bound: boolean;
  contractId: string;
  contractUrl: string;
  assetCode: string;
  communityBps: number;
  targetUsd: number | null;
  policy: GoalPolicy | null;
  round: number | null;
  raisedUsd: number;
  totalRaisedUsd: number;
  totalReleasedUsd: number;
  goalReached: boolean;
  collecting: boolean;
  /** Target the operator scheduled for the next round (0 = stop; null = the policy's default). */
  nextTargetUsd: number | null;
  releasable: boolean;
  recipients: { address: string; label: string; name: string | null; shareBps: number }[];
  releases: { round: number; amountUsd: number; txHash: string; verifyUrl: string; createdAt: string }[];
}

const DAY = 86_400;
/** Rewards frequencies offered in the wizard (seconds), in display order. */
export function getRewardsFrequencies(t: UiTranslator): { seconds: number; label: string; testnetOnly?: boolean }[] { return [
  { seconds: 30 * DAY, label: t("monthly") },
  { seconds: 90 * DAY, label: t("quarterly") },
  { seconds: 180 * DAY, label: t("halfYearly") },
  { seconds: 365 * DAY, label: t("yearly") },
  { seconds: 600, label: t("demoFrequency"), testnetOnly: true },
]; }

export function frequencyLabel(seconds: number | null, t: UiTranslator): string {
  const known = getRewardsFrequencies(t).find((f) => f.seconds === seconds);
  if (known) return known.label;
  if (!seconds) return "—";
  return seconds % DAY === 0 ? t("everyDays", { count: seconds / DAY }) : t("everyMinutes", { count: Math.round(seconds / 60) });
}

export function getPolicyText(t: UiTranslator): Record<GoalPolicy, { label: string; detail: string }> { return {
  stop: {
    label: t("policyStopLabel"),
    detail: t("policyStopDetail"),
  },
  "new-round": {
    label: t("policyNewRoundLabel"),
    detail: t("policyNewRoundDetail"),
  },
}; }

export function txUrl(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function percent(bps: number, locale: string): string {
  return `${(bps / 100).toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
}

/** Token amounts keep up to 7 decimals so tiny rewards don't round to $0.00. */
export function formatAmount(amount: number, locale: string): string {
  return amount.toLocaleString(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  });
}

export function formatTs(ts: number, locale: string): string {
  return new Date(ts * 1000).toLocaleString(locale, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** "4m 05s" style countdown. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${rest}s`;
}

export function getStatusStyle(t: UiTranslator): Record<PeriodStatus, { label: string; className: string }> { return {
  current: { label: t("periodCollecting"), className: "bg-emerald-50 text-emerald-700" },
  ended: { label: t("periodEnded"), className: "bg-amber-50 text-amber-700" },
}; }

/**
 * Ledger-time clock: the API reports the ledger timestamp at read time; this
 * keeps ticking it locally so countdowns move between refreshes.
 */
export function ledgerNow(ledgerTime: number | null, fetchedAtMs: number, nowMs: number): number {
  if (ledgerTime === null) return Math.floor(nowMs / 1000);
  return ledgerTime + Math.floor((nowMs - fetchedAtMs) / 1000);
}
