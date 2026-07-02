// TypeScript-level role and split helpers used by the API. These remain in
// code so the current demo payloads stay plain JSON/number values.

export const ROLES = ["OPERATOR", "VENDOR", "BUYER", "COMMUNITY"] as const;
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
