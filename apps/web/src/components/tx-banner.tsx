"use client";

// Status line for one on-chain action: pending (spinner) → confirmed (with an
// explorer link) → or the API's error message.

import { txUrl } from "@/lib/rewards";

export type TxState =
  | { state: "idle" }
  | { state: "pending"; label: string }
  | { state: "done"; label: string; txHash: string }
  | { state: "error"; message: string };

export function TxBanner({ tx, onDismiss }: { tx: TxState; onDismiss: () => void }) {
  if (tx.state === "idle") return null;
  if (tx.state === "pending") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-navy-900" />
        {tx.label} — submitting to Stellar testnet (usually 5–10 s)…
      </div>
    );
  }
  if (tx.state === "done") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <span>✓ {tx.label}: confirmed on-chain.</span>
        <span className="flex items-center gap-3">
          <a
            href={txUrl(tx.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2"
          >
            View transaction ↗
          </a>
          <button onClick={onDismiss} className="text-emerald-700/70 hover:text-emerald-900">
            ✕
          </button>
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-start justify-between gap-2 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
      <span>{tx.message}</span>
      <button onClick={onDismiss} className="text-red-400 hover:text-red-700">
        ✕
      </button>
    </div>
  );
}
