"use client";

// Operator view of Community Rewards. Every number here comes from the
// Soroban contract via /api/rewards (treasury, periods, shares, entitlements,
// claim status); only explorer links and member names come from Compaki's
// database. Refreshes every 10s so contributions appear right after a sale.

import { useEffect, useState } from "react";

import { TxBanner, type TxState } from "@/components/tx-banner";
import { formatDateTime } from "@/lib/format";
import {
  STATUS_STYLE,
  formatAmount,
  formatCountdown,
  formatTs,
  ledgerNow,
  percent,
  shortAddress,
  txUrl,
  type PeriodView,
  type RewardsView,
} from "@/lib/rewards";

interface Payload {
  canManage: boolean;
  rewards: RewardsView;
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500";

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
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load rewards");
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

  /** Runs one on-chain action through the API and refreshes afterwards. */
  const run = async (label: string, url: string, body?: unknown) => {
    setTx({ state: "pending", label });
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const result = (await res.json()) as { txHash?: string; error?: string };
      if (!res.ok || !result.txHash) throw new Error(result.error ?? "Transaction failed");
      setTx({ state: "done", label, txHash: result.txHash });
      setVersion((v) => v + 1);
      return true;
    } catch (err) {
      setTx({ state: "error", message: err instanceof Error ? err.message : "Transaction failed" });
      return false;
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
            Reading the rewards treasury from the contract…
          </span>
        )}
      </section>
    );
  }

  const { rewards, canManage } = data;
  if (!rewards.bound) {
    return (
      <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        This marketplace isn&apos;t registered in the configured contract yet. An administrator
        must run <code className="font-mono">npm run marketplaces:rebind</code> after the contract
        redeploy.
      </section>
    );
  }

  const ledger = ledgerNow(rewards.ledgerTime, fetchedAt, now);
  const current = rewards.periods[0] ?? null;
  const currentStatus = current
    ? current.status === "active" && ledger >= current.endTs
      ? "ended"
      : current.status
    : null;
  const canOpen = !current || currentStatus !== "active";

  return (
    <section className="mt-6 space-y-4">
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5">
        <p className="text-sm text-slate-700">
          <span className="font-medium text-slate-900">
            {percent(rewards.communityBps)} of every sale
          </span>{" "}
          is held by the Compaki smart contract — not by you or Compaki — and paid out to the
          members of each period according to shares fixed before the period starts. No one can
          withdraw it or change a running period&apos;s rules.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Contract{" "}
          <a
            href={rewards.contractUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono underline decoration-dotted underline-offset-2 hover:text-slate-700"
          >
            {shortAddress(rewards.contractId)} ↗
          </a>{" "}
          · amounts in {rewards.assetCode}, self-issued testnet demo money (not Circle USDC)
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Held in treasury" value={formatAmount(rewards.treasury?.heldUsd ?? 0)} accent />
        <Stat label="Contributed (all time)" value={formatAmount(rewards.treasury?.contributedUsd ?? 0)} />
        <Stat label="Claimed by members" value={formatAmount(rewards.treasury?.claimedUsd ?? 0)} />
        <Stat
          label="Current period"
          value={current ? `#${current.periodId}` : "None"}
          note={
            current && currentStatus
              ? currentStatus === "active"
                ? `ends in ${formatCountdown(current.endTs - ledger)}`
                : STATUS_STYLE[currentStatus].label
              : "checkout paused"
          }
        />
      </div>

      <TxBanner tx={tx} onDismiss={() => setTx({ state: "idle" })} />

      {current && currentStatus ? (
        <PeriodCard
          period={current}
          status={currentStatus}
          ledger={ledger}
          highlight
          action={
            currentStatus === "ended" ? (
              <button
                disabled={tx.state === "pending"}
                onClick={() =>
                  void run(
                    `Closing period #${current.periodId}`,
                    `/api/rewards/marketplace/${slug}/periods/${current.periodId}/close`,
                  )
                }
                className="rounded-full bg-navy-900 px-4 py-2 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-40"
              >
                Close period &amp; fix rewards
              </button>
            ) : null
          }
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-6 text-sm text-amber-800">
          No rewards period has been opened yet. Purchases are paused until one is open, so the
          community share of every sale is always booked to a period with known rules.
        </div>
      )}

      {canManage && canOpen && (
        <OpenPeriodForm
          disabled={tx.state === "pending"}
          previous={current}
          onSubmit={(body) =>
            run("Opening a new period", `/api/rewards/marketplace/${slug}/periods`, body)
          }
        />
      )}
      {canManage && current && currentStatus === "ended" && (
        <p className="text-xs text-slate-500">
          Sales stay paused until a new period is open. You can open the next period before or
          after closing this one.
        </p>
      )}

      {canManage && <GuaranteeChecks slug={slug} />}

      {rewards.periods.length > 1 && (
        <div>
          <h3 className="mt-6 text-sm font-medium uppercase tracking-wider text-slate-400">
            Period history
          </h3>
          <div className="mt-3 space-y-3">
            {rewards.periods.slice(1).map((p) => (
              <PeriodCard
                key={p.periodId}
                period={p}
                status={p.status}
                ledger={ledger}
                action={
                  p.status === "ended" ? (
                    <button
                      disabled={tx.state === "pending"}
                      onClick={() =>
                        void run(
                          `Closing period #${p.periodId}`,
                          `/api/rewards/marketplace/${slug}/periods/${p.periodId}/close`,
                        )
                      }
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      Close
                    </button>
                  ) : null
                }
              />
            ))}
          </div>
        </div>
      )}

      <p className="pt-2 text-xs text-slate-400">
        On-chain (read from the contract on every refresh): treasury, periods, members, shares,
        rewards and claim status. Off-chain (Compaki database): member names, transaction links
        and which sale fed which period.
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  note?: string;
  accent?: boolean;
}) {
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
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

function PeriodCard({
  period,
  status,
  ledger,
  action,
  highlight = false,
}: {
  period: PeriodView;
  status: PeriodView["status"];
  ledger: number;
  action: React.ReactNode;
  highlight?: boolean;
}) {
  const style = STATUS_STYLE[status];
  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm ${
        highlight ? "border-slate-300" : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-medium text-slate-900">
            Period #{period.periodId}
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}>
              {style.label}
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {formatTs(period.startTs)} → {formatTs(period.endTs)}
            {status === "active" && ` · ends in ${formatCountdown(period.endTs - ledger)}`}
          </p>
          <p className="mt-1 flex flex-wrap gap-3 text-xs text-slate-400">
            {period.openTxHash && <TxLink hash={period.openTxHash} label="opened" />}
            {period.closeTxHash && <TxLink hash={period.closeTxHash} label="closed" />}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-slate-400">Collected</p>
          <p className="text-xl font-semibold tabular-nums text-slate-900">
            {formatAmount(period.totalUsd)}
          </p>
          {status === "closed" && (
            <p className="text-xs text-slate-500">{formatAmount(period.claimedUsd)} claimed</p>
          )}
        </div>
      </div>

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
            <th className="py-2 font-medium">Member</th>
            <th className="py-2 text-right font-medium">Share</th>
            <th className="py-2 text-right font-medium">
              {status === "closed" ? "Reward" : "Projected"}
            </th>
            <th className="py-2 text-right font-medium">Claim</th>
          </tr>
        </thead>
        <tbody>
          {period.beneficiaries.map((b) => (
            <tr key={b.address} className="border-b border-slate-50 last:border-0">
              <td className="py-2">
                <span className="font-medium text-slate-900">{b.name ?? "External member"}</span>
                <span className="ml-2 font-mono text-xs text-slate-400">{shortAddress(b.address)}</span>
              </td>
              <td className="py-2 text-right tabular-nums text-slate-600">{percent(b.shareBps)}</td>
              <td className="py-2 text-right font-semibold tabular-nums text-slate-900">
                {formatAmount(b.amountUsd ?? b.projectedUsd)}
              </td>
              <td className="py-2 text-right text-xs">
                {status !== "closed" ? (
                  <span className="text-slate-400">after close</span>
                ) : b.claimed ? (
                  b.claimTxHash ? (
                    <TxLink hash={b.claimTxHash} label="claimed" />
                  ) : (
                    <span className="text-emerald-700">claimed</span>
                  )
                ) : (
                  <span className="text-amber-700">unclaimed</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {period.contributions.length > 0 && (
        <details className="mt-3 text-xs text-slate-500">
          <summary className="cursor-pointer select-none">
            {period.contributions.length} contributing sale
            {period.contributions.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-1">
            {period.contributions.map((c) => (
              <li key={c.saleId} className="flex justify-between gap-2">
                <span>{formatDateTime(c.createdAt)}</span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums text-slate-700">+{formatAmount(c.communityUsd)}</span>
                  <TxLink hash={c.txHash} label="purchase" />
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {action && <div className="mt-4 flex justify-end">{action}</div>}
    </div>
  );
}

function TxLink({ hash, label }: { hash: string; label: string }) {
  return (
    <a
      href={txUrl(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-slate-400 underline decoration-dotted underline-offset-2 hover:text-slate-700"
    >
      {label} ↗
    </a>
  );
}

interface MemberRow {
  who: string; // email or G... address
  percent: string;
}

function OpenPeriodForm({
  disabled,
  previous,
  onSubmit,
}: {
  disabled: boolean;
  previous: PeriodView | null;
  onSubmit: (body: unknown) => Promise<boolean>;
}) {
  const [rows, setRows] = useState<MemberRow[]>([
    { who: "", percent: "50" },
    { who: "", percent: "50" },
  ]);
  const [minutes, setMinutes] = useState("10");
  const [formError, setFormError] = useState<string | null>(null);

  const totalBps = rows.reduce((acc, r) => acc + Math.round(Number(r.percent || 0) * 100), 0);
  const filled = rows.every((r) => r.who.trim() !== "" && Number(r.percent) > 0);
  const valid = filled && totalBps === 10_000 && Number(minutes) >= 1;

  const update = (i: number, patch: Partial<MemberRow>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    setFormError(null);
    const beneficiaries = rows.map((r) => {
      const who = r.who.trim();
      const shareBps = Math.round(Number(r.percent) * 100);
      return /^G[A-Z2-7]{55}$/.test(who) ? { address: who, shareBps } : { email: who, shareBps };
    });
    const ok = await onSubmit({ durationMinutes: Math.round(Number(minutes)), beneficiaries });
    if (!ok) setFormError("The period was not opened — see the message above.");
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="font-medium text-slate-900">Open a new rewards period</p>
      <p className="mt-0.5 text-sm text-slate-500">
        Members and shares are written to the contract and frozen for the whole period. Up to 20
        members; use a Compaki account email or any Stellar address (G…).
      </p>
      {previous && (
        <button
          type="button"
          onClick={() =>
            setRows(
              previous.beneficiaries.map((b) => ({
                who: b.address,
                percent: String(b.shareBps / 100),
              })),
            )
          }
          className="mt-2 text-xs font-medium text-navy-700 underline underline-offset-2"
        >
          Reuse members of period #{previous.periodId}
        </button>
      )}

      <div className="mt-4 space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={row.who}
              onChange={(e) => update(i, { who: e.target.value })}
              placeholder="member@example.com or G…"
              className={inputClass}
              disabled={disabled}
            />
            <div className="relative w-28 shrink-0">
              <input
                value={row.percent}
                onChange={(e) => update(i, { percent: e.target.value })}
                inputMode="decimal"
                className={`${inputClass} pr-7 text-right`}
                disabled={disabled}
              />
              <span className="pointer-events-none absolute right-3 top-2 text-sm text-slate-400">%</span>
            </div>
            <button
              type="button"
              onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
              disabled={disabled || rows.length === 1}
              className="rounded-full px-2 text-slate-400 hover:text-slate-700 disabled:opacity-30"
              aria-label="Remove member"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, { who: "", percent: "0" }])}
          disabled={disabled || rows.length >= 20}
          className="font-medium text-navy-700 disabled:opacity-40"
        >
          + Add member
        </button>
        <span className={totalBps === 10_000 ? "text-emerald-700" : "text-amber-700"}>
          Total {percent(totalBps)} {totalBps === 10_000 ? "✓" : "(must be exactly 100%)"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <label className="text-sm text-slate-700">
          Duration
          <span className="mt-1 flex items-center gap-2">
            <input
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              inputMode="numeric"
              className={`${inputClass} w-24 text-right`}
              disabled={disabled}
            />
            <span className="text-sm text-slate-500">minutes (ledger time)</span>
          </span>
        </label>
        <button
          onClick={() => void submit()}
          disabled={!valid || disabled}
          className="rounded-full bg-navy-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Commit rules &amp; open period
        </button>
      </div>
      {formError && <p className="mt-2 text-xs text-red-600">{formError}</p>}
    </div>
  );
}

type CheckResult =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; applicable: boolean; rejected?: boolean; reason?: string; control?: string; message?: string }
  | { state: "error"; message: string };

function GuaranteeChecks({ slug }: { slug: string }) {
  const [results, setResults] = useState<Record<string, CheckResult>>({});

  const check = async (kind: "change-rules" | "withdraw") => {
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

  const checks = [
    {
      kind: "change-rules" as const,
      title: "Redirect the running period to another address",
      detail: "You, as operator, re-open the current period with 100% to a new address.",
    },
    {
      kind: "withdraw" as const,
      title: "Withdraw the treasury to your account",
      detail: "You move the held tokens straight out of the contract via the token contract.",
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="font-medium text-slate-900">Try to break the rules</p>
      <p className="mt-0.5 text-sm text-slate-500">
        Each check evaluates the action with your operator signature against the live contract,
        exactly as the network would. Nothing is submitted.
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
                {r.state === "running" ? "Checking…" : "Try it"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
