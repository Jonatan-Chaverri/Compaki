import en from "../../messages/en.json";
import es from "../../messages/es.json";
import type { UiTranslator } from "./types";

// Error states can outlive a language change. Resolve known messages back to
// their catalog key, and keep provider/server diagnostics out of customer UI.
const messageKeys = new Map<string, string>();
for (const messages of [en.ui, es.ui]) {
  for (const [key, value] of Object.entries(messages)) {
    if (!value.includes("{")) messageKeys.set(value, key);
  }
}
const serverKeys: Record<string, string> = {
  "Only rewards marketplaces have claims.": "claimsNotApplicable",
  "Invalid email or password": "passwordInvalid",
  "Not signed in": "signInOrCreateAccount",
  "Sign in to pay": "signInOrCreateAccount",
  "Sign in to place an order": "signInOrCreateAccount",
  "Some cart items are no longer available": "cartItemsUnavailable",
};

export function localizedMessage(error: unknown, t: UiTranslator, fallback: string): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const key = serverKeys[message] ?? messageKeys.get(message);
  if (key && t.has(key)) return t(key);
  if (/too many|rate.limit|429/i.test(message)) return t("requestLimit");
  if (/code.*(?:invalid|expired|incorrect)|(?:invalid|expired|incorrect).*code/i.test(message)) return t("codeInvalid");
  const stock = /^Only (\d+) units? of (.+) left in stock$/.exec(message);
  if (stock) return t("stockChanged", { count: Number(stock[1]), product: stock[2] });
  return fallback;
}
