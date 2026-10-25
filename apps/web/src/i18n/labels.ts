import type { UiTranslator } from "./types";

/** Keep persisted/API categories stable; translate only their display labels. */
export function categoryLabel(value: string, t: UiTranslator): string {
  const keys: Record<string, string> = {
    "Coffee & agriculture": "categoryCoffee",
    Crafts: "categoryCrafts",
    Services: "categoryServices",
    Other: "categoryOther",
    "All marketplaces": "categoryAll",
  };
  return keys[value] ? t(keys[value]) : value;
}

export function recipientRole(key: string, t: UiTranslator): string {
  const keys: Record<string, string> = {
    vendor: "roleVendor", seller: "roleVendor", marketplace: "roleMarketplace",
    operator: "roleMarketplace", community: "roleCommunity", compaki: "rolePlatform", platform: "rolePlatform",
  };
  return t(keys[key] ?? "roleMarketplace");
}
