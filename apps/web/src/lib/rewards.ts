// Community Rewards and fundraising payload types (mirrors of
// apps/api/src/lib/rewards.ts and fundraise.ts) and small display helpers
// shared by the operator panel, the community page and the rewards page.

export type CommunityMode = "classic" | "rewards" | "fundraise";
export type PeriodStatus = "current" | "ended";
export type GoalPolicy = "stop" | "new-round" | "direct";

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
  endTs: number;
  status: PeriodStatus;
  vendorPoolUsd: number;
  buyerPoolUsd: number;
  salesUsd: number;
  claimedUsd: number;
  salesCount: number;
  participants: ParticipantView[];
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
  startTs: number | null;
  currentPeriod: number | null;
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
  releasable: boolean;
  recipients: { address: string; label: string; name: string | null; shareBps: number }[];
  releases: { round: number; amountUsd: number; txHash: string; verifyUrl: string; createdAt: string }[];
}

const DAY = 86_400;
/** Rewards frequencies offered in the wizard (seconds), in display order. */
export const REWARDS_FREQUENCIES: { seconds: number; label: string; testnetOnly?: boolean }[] = [
  { seconds: 30 * DAY, label: "Every month" },
  { seconds: 90 * DAY, label: "Every 3 months" },
  { seconds: 180 * DAY, label: "Every 6 months" },
  { seconds: 365 * DAY, label: "Every year" },
  { seconds: 600, label: "Every 10 minutes (testnet demo)", testnetOnly: true },
];

export function frequencyLabel(seconds: number | null): string {
  const known = REWARDS_FREQUENCIES.find((f) => f.seconds === seconds);
  if (known) return known.label;
  if (!seconds) return "—";
  return seconds % DAY === 0 ? `Every ${seconds / DAY} days` : `Every ${Math.round(seconds / 60)} minutes`;
}

export const POLICY_TEXT: Record<GoalPolicy, { label: string; detail: string }> = {
  stop: {
    label: "Stop fundraising",
    detail: "After the target is paid out, sales stop collecting for the community; sellers keep that share.",
  },
  "new-round": {
    label: "Start a new round",
    detail: "After each payout, a new round starts from zero toward the same target and wallets.",
  },
  direct: {
    label: "Pay wallets directly",
    detail: "After the target is paid out, every sale sends its community share straight to the wallets.",
  },
};

export function txUrl(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function percent(bps: number): string {
  return `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

/** Token amounts keep up to 7 decimals so tiny rewards don't round to $0.00. */
export function formatAmount(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  });
}

export function formatTs(ts: number): string {
  return new Date(ts * 1000).toLocaleString("en-US", {
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

export const STATUS_STYLE: Record<PeriodStatus, { label: string; className: string }> = {
  current: { label: "Collecting", className: "bg-emerald-50 text-emerald-700" },
  ended: { label: "Ended · rewards can be claimed", className: "bg-amber-50 text-amber-700" },
};

/**
 * Ledger-time clock: the API reports the ledger timestamp at read time; this
 * keeps ticking it locally so countdowns move between refreshes.
 */
export function ledgerNow(ledgerTime: number | null, fetchedAtMs: number, nowMs: number): number {
  if (ledgerTime === null) return Math.floor(nowMs / 1000);
  return ledgerTime + Math.floor((nowMs - fetchedAtMs) / 1000);
}
