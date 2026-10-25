"use client";

// Operator view of a protected community fund: Community Rewards periods or
// fundraising progress. Every rule, pool, total and recipient here comes
// from the Soroban contract via /api/rewards; who took part, names and
// explorer links come from Compaki's database. Refreshes every 10s so
// contributions appear right after a sale.

import { useEffect, useState } from "react";

import { FundraiseProgress, RewardsPeriodCard, RewardsRules } from "@/components/community-fund";
import { TxBanner, type TxState } from "@/components/tx-banner";
import {
  formatAmount,
  ledgerNow,
  percent,
  shortAddress,
  type CommunityMode,
  type FundraiseView,
  type RewardsView,
} from "@/lib/rewards";

interface Payload {
  mode: CommunityMode;
  canManage: boolean;
  rewards: RewardsView | null;
  fundraise: FundraiseView | null;
}

export function RewardsPanel({ slug }: { slug: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tx, setTx] = useState<TxState>({ state: "idle" });
  const [now, setNow] = useState(() => Date.now());

  // Bumped after every action to refetch immediately.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/rewards/marketplace/${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });
        const body = (await res.json()) as Payload & { error?: string };
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
        if (cancelled) return;
        setData(body);
        setFetchedAt(Date.now());
        setLoadError(null);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load the community fund");
      }
    };
    void load();
    const poll = setInterval(() => void load(), 10_000);
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [slug, version]);

  const release = async () => {
    setTx({ state: "pending", label: "Paying out the fundraising target" });
    try {
      const res = await fetch(`/api/rewards/marketplace/${encodeURIComponent(slug)}/fundraise/release`, {
        method: "POST",
      });
      const result = (await res.json()) as { txHash?: string; error?: string };
      if (!res.ok || !result.txHash) throw new Error(result.error ?? "Payout failed");
      setTx({ state: "done", label: "Fundraising payout", txHash: result.txHash });
      setVersion((v) => v + 1);
    } catch (err) {
      setTx({ state: "error", message: err instanceof Error ? err.message : "Payout failed" });
    }
  };

  if (!data) {
    return (
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
        {loadError ? (
          <span className="text-red-600">{loadError}</span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
            Reading the community fund from the contract…
          </span>
        )}
      </section>
    );
  }

  const view = data.rewards ?? data.fundraise;
  if (!view?.bound) {
    return (
      <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        The community fund is still being set up for this marketplace. Contact your administrator to finish
        connecting it before accepting purchases.
      </section>
    );
  }

  const ledger = ledgerNow(data.rewards?.ledgerTime ?? null, fetchedAt, now);

  return (
    <section className="mt-6 space-y-4">
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5">
        <p className="text-sm text-slate-700">
          <span className="font-medium text-slate-900">{percent(view.communityBps)} of every sale</span>{" "}
          {data.mode === "rewards"
            ? "goes into a protected fund that, every period, is shared between the people who sold and bought here, by how much each one sold and bought. Periods follow one another by themselves."
            : "goes into a protected fund until it reaches the target, then it is paid to the wallets fixed at launch."}{" "}
          Nobody, including you, can withdraw it or change these rules.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Contract{" "}
          <a
            href={view.contractUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono underline decoration-dotted underline-offset-2 hover:text-slate-700"
          >
            {shortAddress(view.contractId)} ↗
          </a>{" "}
          · amounts in {view.assetCode}, self-issued testnet demo money (not Circle USDC)
        </p>
      </div>

      <TxBanner tx={tx} onDismiss={() => setTx({ state: "idle" })} />

      {data.rewards && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="In the rewards fund" value={formatAmount(data.rewards.treasury?.heldUsd ?? 0)} accent />
            <Stat label="Total contributed" value={formatAmount(data.rewards.treasury?.contributedUsd ?? 0)} />
            <Stat label="Claimed by sellers and buyers" value={formatAmount(data.rewards.treasury?.claimedUsd ?? 0)} />
          </div>
          <RewardsRules rewards={data.rewards} ledger={ledger} />
          <div className="space-y-3">
            {data.rewards.periods.map((p) => (
              <RewardsPeriodCard key={p.periodId} period={p} ledger={ledger} />
            ))}
          </div>
        </>
      )}

      {data.fundraise && (
        <FundraiseProgress
          fundraise={data.fundraise}
          onRelease={() => void release()}
          releasing={tx.state === "pending"}
        />
      )}

      {data.canManage && <GuaranteeChecks slug={slug} mode={data.mode} />}

      <details className="pt-2 text-xs leading-relaxed text-slate-500">
        <summary className="cursor-pointer">How these numbers are verified</summary>
        <p className="mt-2">
          Rules, pools, totals and recipients are read from Stellar on every refresh. Who sold and bought in each
          period comes from Compaki&apos;s sale records; each person&apos;s exact reward is read from the
          contract when they claim. Demo funds have no monetary value.
        </p>
      </details>
    </section>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${
          accent ? "text-emerald-600" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

type CheckKind = "claim-for-someone" | "withdraw";

type CheckResult =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; applicable: boolean; rejected?: boolean; reason?: string; control?: string; message?: string }
  | { state: "error"; message: string };

function GuaranteeChecks({ slug, mode }: { slug: string; mode: CommunityMode }) {
  const [results, setResults] = useState<Record<string, CheckResult>>({});

  const check = async (kind: CheckKind) => {
    setResults((r) => ({ ...r, [kind]: { state: "running" } }));
    try {
      const res = await fetch(`/api/rewards/marketplace/${slug}/guarantees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const body = (await res.json()) as {
        error?: string;
        applicable?: boolean;
        rejected?: boolean;
        reason?: string;
        control?: string;
        message?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "Check failed");
      setResults((r) => ({
        ...r,
        [kind]: {
          state: "done",
          applicable: body.applicable !== false,
          rejected: body.rejected,
          reason: body.reason,
          control: body.control,
          message: body.message,
        },
      }));
    } catch (err) {
      setResults((r) => ({
        ...r,
        [kind]: { state: "error", message: err instanceof Error ? err.message : "Check failed" },
      }));
    }
  };

  const checks: { kind: CheckKind; title: string; detail: string }[] = [
    {
      kind: "withdraw",
      title: "Withdraw the fund to your account",
      detail: "You move the saved tokens straight out of the contract via the token contract.",
    },
    ...(mode === "rewards"
      ? [
          {
            kind: "claim-for-someone" as const,
            title: "Claim a buyer's reward for them",
            detail: "You sign a claim for one of this period's participants. Only they can claim their reward.",
          },
        ]
      : []),
  ];

  return (
    <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer font-medium text-slate-900">How is the community fund protected?</summary>
      <p className="mt-0.5 text-sm text-slate-500">
        Each check evaluates the action with your operator signature against the live contract, exactly as the
        network would. Nothing is submitted.
      </p>
      <div className="mt-4 space-y-3">
        {checks.map((c) => {
          const r = results[c.kind] ?? { state: "idle" };
          return (
            <div
              key={c.kind}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">{c.title}</p>
                <p className="text-xs text-slate-500">{c.detail}</p>
                {r.state === "done" && !r.applicable && (
                  <p className="mt-1 text-xs text-slate-600">{r.message}</p>
                )}
                {r.state === "done" && r.applicable && r.rejected && (
                  <p className="mt-1 text-xs text-emerald-700">
                    ✓ Rejected by the contract: <code className="font-mono">{r.reason}</code>
                    {r.control && <span className="text-slate-500"> · control: {r.control}</span>}
                  </p>
                )}
                {r.state === "done" && r.applicable && !r.rejected && (
                  <p className="mt-1 text-xs font-medium text-red-700">
                    ✗ The action was NOT rejected — report this.
                  </p>
                )}
                {r.state === "error" && <p className="mt-1 text-xs text-red-600">{r.message}</p>}
              </div>
              <button
                onClick={() => void check(c.kind)}
                disabled={r.state === "running"}
                className="shrink-0 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                {r.state === "running" ? "Checking…" : "Check protection"}
              </button>
            </div>
          );
        })}
      </div>
    </details>
  );
}
