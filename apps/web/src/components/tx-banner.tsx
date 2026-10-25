"use client";
import { localizedMessage } from "@/i18n/errors";
import { useTranslations } from "next-intl";

// Status line for one on-chain action: pending (spinner) → confirmed (with an
// explorer link) → or the API's error message.

import { txUrl } from "@/lib/rewards";

export type TxState =
  | { state: "idle" }
  | { state: "pending"; label: string }
  | { state: "done"; label: string; txHash: string }
  | { state: "error"; message: string };

export function TxBanner({ tx, onDismiss }: { tx: TxState; onDismiss: () => void }) {
  const t = useTranslations("ui");

  if (tx.state === "idle") return null;
  if (tx.state === "pending") {
    return (
      <div role="status" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-navy-900" />
        {localizedMessage(tx.label, t, tx.label)} {" "}{t("confirmingYourRequestUsually510Seconds")}</div>
    );
  }
  if (tx.state === "done") {
    return (
      <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <span>✓ {localizedMessage(tx.label, t, tx.label)}{t("confirmed")}</span>
        <span className="flex items-center gap-3">
          <a
            href={txUrl(tx.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2"
          >
            {t("viewTransaction")}</a>
          <button aria-label={t("dismissNotification")} onClick={onDismiss} className="text-emerald-700/70 hover:text-emerald-900">
            ✕
          </button>
        </span>
      </div>
    );
  }
  return (
    <div role="alert" className="flex items-start justify-between gap-2 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
      <span>{localizedMessage(tx.message, t, t("transactionFailed"))}</span>
      <button aria-label={t("dismissNotification")} onClick={onDismiss} className="text-red-400 hover:text-red-700">
        ✕
      </button>
    </div>
  );
}
