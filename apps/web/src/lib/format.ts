export function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Translate the legacy system-generated fund label into customer language. */
export function communityFundLabel(name: string | null): string {
  if (!name) return "the community";
  return name === "Community Rewards treasury (on-chain)" ? "community rewards" : name;
}
