// TypeScript-level role and split helpers used by the API. These remain in
// code so the current demo payloads stay plain JSON/number values.

export const ROLES = ["OPERATOR", "VENDOR", "BUYER"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** Parsed shape of Sale.splitSnapshot, stored as a JSON string. */
export interface SplitSnapshot {
  vendorBps: number;
  operatorBps: number;
  communityBps: number;
  vendorAmountUsd: number;
  operatorAmountUsd: number;
  communityAmountUsd: number;
  /** Compaki's fixed platform fee (absent on sales predating it). */
  platformBps?: number;
  platformAmountUsd?: number;
  /**
   * Community Rewards marketplaces: the on-chain period the sale was booked
   * to (returned by the purchase transaction). Absent for other marketplaces
   * and for sales predating Community Rewards.
   */
  rewardsPeriodId?: number | null;
  /**
   * Fundraising marketplaces: the round the community share was added to.
   * Null once a stopped or direct-payout fundraiser reached its target.
   */
  fundraiseRound?: number | null;
  /** On-chain addresses of the two parties (absent on older sales). */
  buyerAddress?: string;
  vendorAddress?: string;
}

export function parseSplitSnapshot(raw: string): SplitSnapshot {
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("vendorBps" in parsed)
  ) {
    throw new Error("Invalid split snapshot payload");
  }
  return parsed as SplitSnapshot;
}
