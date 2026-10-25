import type { UiTranslator } from "@/i18n/types";

export function formatUsd(amount: number, locale: string): string {
  return amount.toLocaleString(locale, {
    style: "currency",
    currency: "USD",
  });
}

export function formatDateTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Translate the legacy system-generated fund label into customer language. */
export function communityFundLabel(name: string | null, t: UiTranslator): string {
  if (!name) return t("theCommunity");
  if (name === "Community Rewards treasury (on-chain)") return t("communityRewards2");
  if (name.endsWith(" Community Fund")) return t("communityFundFor", { name: name.slice(0, -15) });
  return name;
}
