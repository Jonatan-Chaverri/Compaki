// Community Rewards payload types (mirror of apps/api/src/lib/rewards.ts) and
// small display helpers shared by the operator panel and the member page.

export type PeriodStatus = "active" | "ended" | "closed";

export interface BeneficiaryView {
  address: string;
  name: string | null;
  shareBps: number;
  projectedUsd: number;
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
  contributions: { saleId: string; txHash: string; communityUsd: number; createdAt: string }[];
}

export interface RewardsView {
  enabled: boolean;
  bound: boolean;
  contractId: string;
  contractUrl: string;
  assetCode: string;
  communityBps: number;
  ledgerTime: number | null;
  treasury: { contributedUsd: number; claimedUsd: number; heldUsd: number } | null;
  periodCount: number;
  periods: PeriodView[];
}

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
  active: { label: "Active", className: "bg-emerald-50 text-emerald-700" },
  ended: { label: "Ended — ready to close", className: "bg-amber-50 text-amber-700" },
  closed: { label: "Closed", className: "bg-slate-100 text-slate-600" },
};

/**
 * Ledger-time clock: the API reports the ledger timestamp at read time; this
 * keeps ticking it locally so countdowns move between refreshes.
 */
export function ledgerNow(ledgerTime: number | null, fetchedAtMs: number, nowMs: number): number {
  if (ledgerTime === null) return Math.floor(nowMs / 1000);
  return ledgerTime + Math.floor((nowMs - fetchedAtMs) / 1000);
}
