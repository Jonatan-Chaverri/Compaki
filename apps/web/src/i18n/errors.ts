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
  "Not signed in": "signInOrCreateAccount",
  "Sign in to pay": "signInOrCreateAccount",
  "Sign in to place an order": "signInOrCreateAccount",
  "Some cart items are no longer available": "cartItemsUnavailable",
  "Activate your seller profile first": "sellerActivateFirst",
  "Marketplace is not fully set up": "sellerMarketplaceUnavailable",
  "Finish setting up your wallet first": "sellerPaymentSetup",
  "Could not prepare your seller account. Please try again.": "sellerPrepareFailed",
};

export function localizedMessage(error: unknown, t: UiTranslator, fallback: string): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const key = serverKeys[message] ?? messageKeys.get(message);
  if (key && t.has(key)) return t(key);
  if (/too many|rate.limit|429/i.test(message)) return t("requestLimit");
  if (/code.*(?:invalid|expired|incorrect)|(?:invalid|expired|incorrect).*code/i.test(message)) return t("codeInvalid");
  const stock = /^Only (\d+) units? of (.+) left in stock$/.exec(message);
  if (stock) return t("stockChanged", { count: Number(stock[1]), product: stock[2] });
  // API messages that carry values (apps/api/src/routes/*).
  const dynamic: [RegExp, (m: RegExpExecArray) => string][] = [
    [/^At most (\d+) recipient wallets$/, (m) => t("apiAtMostRecipients", { count: Number(m[1]) })],
    [/^Invalid Stellar address: (.*)$/, (m) => t("apiInvalidStellarAddress", { address: m[1] })],
    [/^Recipient shares must add up to exactly 100% \(got ([\d.]+)%\)$/, (m) => t("rulesTotalError", { total: Number(m[1]) })],
    [/^The community fund's wallet doesn't exist on Stellar testnet\./, () => t("apiFundWalletMissing")],
    [/^The community fund's wallet doesn't accept (\S+) yet\./, (m) => t("apiFundNoTrustline", { code: m[1] })],
    [/^(.+)'s wallet doesn't exist on Stellar testnet\./, (m) => t("apiRecipientWalletMissing", { name: m[1] })],
    [/^(.+)'s wallet doesn't accept (\S+) yet\./, (m) => t("apiRecipientNoTrustline", { name: m[1], code: m[2] })],
    [/^(.+) is not ready for purchase yet$/, (m) => t("apiProductNotReady", { product: m[1] })],
    [/^(.+) is already paid$/, (m) => t("apiProductAlreadyPaid", { product: m[1] })],
    [/^You already have \$(\d+) or more in demo money$/, (m) => t("apiFaucetMax", { amount: m[1] })],
    [/^(Community purpose|Who benefits|Distribution explanation) must be text$/, (m) => t("apiFieldText", { field: fieldLabel(m[1], t) })],
    [
      /^(Community purpose|Who benefits|Distribution explanation) must be (\d+)–(\d+) characters$/,
      (m) => t("apiFieldLength", { field: fieldLabel(m[1], t), min: Number(m[2]), max: Number(m[3]) }),
    ],
  ];
  for (const [pattern, translate] of dynamic) {
    const match = pattern.exec(message);
    if (match) return translate(match);
  }
  return fallback;
}

function fieldLabel(field: string, t: UiTranslator): string {
  const keys: Record<string, string> = {
    "Community purpose": "apiFieldPurpose",
    "Who benefits": "apiFieldBeneficiaries",
    "Distribution explanation": "apiFieldDistribution",
  };
  return t(keys[field] ?? "apiFieldPurpose");
}
