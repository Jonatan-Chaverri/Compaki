"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { TxBanner, type TxState } from "@/components/tx-banner";
import {
  STATUS_STYLE,
  formatAmount,
  formatCountdown,
  formatTs,
  ledgerNow,
  percent,
  shortAddress,
  txUrl,
  type PeriodStatus,
} from "@/lib/rewards";

interface MemberPeriod {
  periodId: number;
  startTs: number;
  endTs: number;
  status: PeriodStatus;
  totalUsd: number;
  shareBps: number;
  projectedUsd: number;
  amountUsd: number | null;
  claimed: boolean | null;
  claimTxHash: string | null;
  closeTxHash: string | null;
}

export interface MemberRewardsPayload {
  address: string | null;
  marketplaces: { name: string; slug: string; ledgerTime: number | null; periods: MemberPeriod[] }[];
}

export function MemberRewards({ initial }: { initial: MemberRewardsPayload }) {
  const [data, setData] = useState(initial);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [tx, setTx] = useState<TxState>({ state: "idle" });
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/rewards/me", { cache: "no-store" });
      if (!res.ok) return;
      setData((await res.json()) as MemberRewardsPayload);
      setFetchedAt(Date.now());
    } catch {
      // transient — keep the last data
    }
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    const poll = setInterval(() => void reload(), 15_000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [reload]);

  const act = async (key: string, pendingLabel: string, label: string, url: string) => {
    setBusy(key);
    setTx({ state: "pending", label: pendingLabel });
    try {
      const res = await fetch(url, { method: "POST" });
      const body = (await res.json()) as { txHash?: string; error?: string; amountUsd?: number };
      if (!res.ok || !body.txHash) throw new Error(body.error ?? "Transaction failed");
      setTx({
        state: "done",
        label: body.amountUsd !== undefined ? `${label} — ${formatAmount(body.amountUsd)} received` : label,
        txHash: body.txHash,
      });
      await reload();
    } catch (err) {
      setTx({ state: "error", message: err instanceof Error ? err.message : "Transaction failed" });
    } finally {
      setBusy(null);
    }
  };

  if (data.marketplaces.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        You aren&apos;t a member of any rewards period yet. A marketplace operator adds members
        when they open a period.
        {data.address && (
          <p className="mt-2 font-mono text-xs text-slate-400">Your payment account: {data.address}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <TxBanner tx={tx} onDismiss={() => setTx({ state: "idle" })} />
      {data.marketplaces.map((m) => {
        const ledger = ledgerNow(m.ledgerTime, fetchedAt, now);
        return (
          <section key={m.slug}>
            <h2 className="flex items-baseline justify-between text-sm font-medium uppercase tracking-wider text-slate-400">
              <Link href={`/m/${m.slug}`} className="hover:text-slate-700">
                {m.name}
              </Link>
              {data.address && (
                <span className="font-mono text-[11px] normal-case tracking-normal">
                  paid to {shortAddress(data.address)}
                </span>
              )}
            </h2>
            <div className="mt-3 space-y-3">
              {m.periods.map((p) => {
                const status: PeriodStatus =
                  p.status === "active" && ledger >= p.endTs ? "ended" : p.status;
                const key = `${m.slug}:${p.periodId}`;
                const amount = p.amountUsd ?? p.projectedUsd;
                return (
                  <div
                    key={key}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div>
                      <p className="flex items-center gap-2 font-medium text-slate-900">
                        Period #{p.periodId}
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status].className}`}
                        >
                          {STATUS_STYLE[status].label}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Your share {percent(p.shareBps)} of {formatAmount(p.totalUsd)} ·{" "}
                        {status === "active"
                          ? `ends in ${formatCountdown(p.endTs - ledger)}`
                          : `ended ${formatTs(p.endTs)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-wider text-slate-400">
                          {p.amountUsd === null ? "Projected" : "Your reward"}
                        </p>
                        <p className="text-xl font-semibold tabular-nums text-emerald-600">
                          {formatAmount(amount)}
                        </p>
                      </div>
                      {status === "active" && (
                        <span className="text-xs text-slate-400">claimable after close</span>
                      )}
                      {status === "ended" && (
                        <button
                          onClick={() =>
                            void act(
                              key,
                              `Closing period #${p.periodId}`,
                              `Closed period #${p.periodId}`,
                              `/api/rewards/marketplace/${m.slug}/periods/${p.periodId}/close`,
                            )
                          }
                          disabled={busy !== null}
                          className="rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                        >
                          Close period
                        </button>
                      )}
                      {status === "closed" && p.claimed && (
                        <span className="text-xs font-medium text-emerald-700">
                          ✓ Claimed
                          {p.claimTxHash && (
                            <a
                              href={txUrl(p.claimTxHash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 font-normal text-slate-400 underline decoration-dotted underline-offset-2 hover:text-slate-700"
                            >
                              tx ↗
                            </a>
                          )}
                        </span>
                      )}
                      {status === "closed" && !p.claimed && (p.amountUsd ?? 0) > 0 && (
                        <button
                          onClick={() =>
                            void act(
                              key,
                              `Claiming your period #${p.periodId} reward`,
                              `Claimed period #${p.periodId}`,
                              `/api/rewards/marketplace/${m.slug}/periods/${p.periodId}/claim`,
                            )
                          }
                          disabled={busy !== null}
                          className="rounded-full bg-navy-900 px-5 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-40"
                        >
                          {busy === key ? "Claiming…" : "Claim"}
                        </button>
                      )}
                      {status === "closed" && !p.claimed && (p.amountUsd ?? 0) === 0 && (
                        <span className="text-xs text-slate-400">nothing to claim</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      <p className="text-xs text-slate-400">
        Amounts, shares and claim status are read from the Soroban contract. Compaki holds your
        payment account&apos;s key (custodial) and signs the claim for you; the contract only ever
        pays the member address itself.
      </p>
    </div>
  );
}
