"use client";

// Live on-chain balance widget: polls the real testnet token balance so the
// number visibly updates seconds after a sale settles.

import { useEffect, useState } from "react";

import { formatUsd } from "@/lib/format";

export function LiveBalance({
  account,
  label,
  accent = false,
  pollMs = 5_000,
}: {
  account: string;
  label: string;
  accent?: boolean;
  pollMs?: number;
}) {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/balance?account=${account}`);
        if (!res.ok) return;
        const data = (await res.json()) as { balanceUsd: number };
        if (!cancelled) setBalance(data.balanceUsd);
      } catch {
        // transient network error — keep the last value
      }
    };
    void load();
    const timer = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [account, pollMs]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${
          accent ? "text-emerald-600" : "text-slate-900"
        }`}
      >
        {balance === null ? "—" : formatUsd(balance)}
      </p>
    </div>
  );
}
