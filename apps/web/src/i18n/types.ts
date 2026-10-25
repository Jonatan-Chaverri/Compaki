import type { useTranslations } from "next-intl";

/** Shared namespace translator for pure formatting and validation helpers. */
export type UiTranslator = ReturnType<typeof useTranslations<"ui">>;
