"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { EmptyState } from "@/components/shell";
import { useCompakiWallet } from "@/components/cavos-provider";
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
import { followSignatures, readResult } from "@/lib/wallet-signing";

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
  const wallet = useCompakiWallet();

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
      // Cavos wallets sign the claim here (202 + transaction to approve);
      // custodial accounts are signed by the API.
      const result = await followSignatures<{ txHash?: string; amountUsd?: number }>(
        await readResult(await fetch(url, { method: "POST" })),
        wallet.signXdr,
        () => setTx({ state: "pending", label: "Approve in your wallet" }),
      );
      const body = result.body;
      if (result.status !== 200 || !body.txHash) throw new Error(body.error ?? "Transaction failed");
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
      <div className="mt-8"><EmptyState icon="leaf" title="Your next chapter of shared good." description="You haven’t been added to a rewards period yet. A marketplace organizer can invite you when they open one." href="/marketplaces" action="Explore your communities" />
        {data.address && <details className="mt-4 rounded-xl border border-slate-200 p-4 text-xs text-slate-500"><summary className="cursor-pointer">Your payment account details</summary><p className="mt-3 break-all font-mono">{data.address}</p></details>}
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
                          {p.amountUsd === null ? "Growing reward" : "Your reward"}
                        </p>
                        <p className="text-xl font-semibold tabular-nums text-emerald-600">
                          {formatAmount(amount)}
                        </p>
                      </div>
                      {status === "active" && (
                        <span className="text-xs text-slate-400">Available after the period closes</span>
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
                          ✓ Collected
                          {p.claimTxHash && (
                            <a
                              href={txUrl(p.claimTxHash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 font-normal text-slate-400 underline decoration-dotted underline-offset-2 hover:text-slate-700"
                            >
                              View payment ↗
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
                          {busy === key ? "Collecting…" : "Collect reward"}
                        </button>
                      )}
                      {status === "closed" && !p.claimed && (p.amountUsd ?? 0) === 0 && (
                        <span className="text-xs text-slate-400">No reward this period</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      <details className="rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-500"><summary className="cursor-pointer font-medium text-slate-700">How your rewards and payment account work</summary><p className="mt-3">Amounts and shares are verified on Stellar. Each period’s rules are fixed when it starts. Compaki manages your payment account and signs collection requests for you; rewards can only be paid to the registered member’s address. Demo rewards have no monetary value.</p></details>
    </div>
  );
}
