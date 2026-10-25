// Shared views of a protected community fund (Community Rewards periods and
// fundraising progress), used by the operator dashboard and the public
// community page. Rules, pools, totals and recipients come from the
// contract; who took part comes from recorded sales.

import {
  POLICY_TEXT,
  STATUS_STYLE,
  formatAmount,
  formatCountdown,
  frequencyLabel,
  percent,
  shortAddress,
  txUrl,
  type FundraiseView,
  type PeriodView,
  type RewardsView,
} from "@/lib/rewards";

function date(ts: number) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(ts * 1000));
}

export function WalletLink({ address }: { address: string }) {
  return (
    <a
      href={`https://stellar.expert/explorer/testnet/${address.startsWith("C") ? "contract" : "account"}/${encodeURIComponent(address)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-xs text-slate-400 underline decoration-dotted underline-offset-2 hover:text-slate-700"
      aria-label={`View wallet ${address} on Stellar`}
    >
      {shortAddress(address)} ↗
    </a>
  );
}

export function RewardsRules({ rewards, ledger }: { rewards: RewardsView; ledger: number }) {
  const current = rewards.periods.find((p) => p.status === "current");
  return (
    <dl className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm sm:grid-cols-4">
      <div>
        <dt className="text-xs text-slate-500">Shared</dt>
        <dd className="mt-1 font-medium">{frequencyLabel(rewards.periodSeconds)}</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Sellers&apos; part</dt>
        <dd className="mt-1 font-medium">{percent(rewards.vendorPoolBps ?? 0)} · by sales</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Buyers&apos; part</dt>
        <dd className="mt-1 font-medium">{percent(rewards.buyerPoolBps ?? 0)} · by purchases</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Current period</dt>
        <dd className="mt-1 font-medium">
          {current ? `Period ${current.periodId + 1} · ends in ${formatCountdown(current.endTs - ledger)}` : "—"}
        </dd>
      </div>
    </dl>
  );
}

export function RewardsPeriodCard({ period, ledger }: { period: PeriodView; ledger: number }) {
  // The ledger clock may pass the end between refreshes.
  const status = period.status === "current" && ledger >= period.endTs ? "ended" : period.status;
  const style = STATUS_STYLE[status];
  const pool = period.vendorPoolUsd + period.buyerPoolUsd;
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
            Period {period.periodId + 1}
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}>{style.label}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {date(period.startTs)} → {date(period.endTs)}
            {status === "current" && ` · ends in ${formatCountdown(period.endTs - ledger)}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-slate-400">Rewards pool</p>
          <p className="text-xl font-semibold tabular-nums text-slate-900">{formatAmount(pool)}</p>
          <p className="text-xs text-slate-500">
            {formatAmount(period.vendorPoolUsd)} sellers · {formatAmount(period.buyerPoolUsd)} buyers
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {formatAmount(period.salesUsd)} sold in {period.salesCount} recorded sale{period.salesCount === 1 ? "" : "s"}
        {status === "ended" && ` · ${formatAmount(period.claimedUsd)} claimed so far`}
      </p>

      {period.participants.length > 0 ? (
        <div className="scroll-table">
          <table className="mt-4 w-full text-sm">
            <caption className="sr-only">Sellers and buyers of period {period.periodId + 1} and their rewards</caption>
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                <th className="py-2 font-medium">Participant</th>
                <th className="py-2 text-right font-medium">Sold</th>
                <th className="py-2 text-right font-medium">Bought</th>
                <th className="py-2 text-right font-medium">{status === "ended" ? "Reward" : "Estimated"}</th>
                <th className="py-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {period.participants.map((p) => (
                <tr key={p.address} className="border-b border-slate-50 last:border-0">
                  <td className="py-2">
                    <span className="mr-2 font-medium text-slate-900">{p.name ?? "Community member"}</span>
                    <WalletLink address={p.address} />
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-600">{p.soldUsd ? formatAmount(p.soldUsd) : "—"}</td>
                  <td className="py-2 text-right tabular-nums text-slate-600">{p.boughtUsd ? formatAmount(p.boughtUsd) : "—"}</td>
                  <td className="py-2 text-right font-semibold tabular-nums text-slate-900">{formatAmount(p.estimatedUsd)}</td>
                  <td className="py-2 text-right text-xs">
                    {p.claimTxHash ? (
                      <a href={txUrl(p.claimTxHash)} target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">
                        claimed ↗
                      </a>
                    ) : status === "ended" ? (
                      <span className="text-amber-700">ready to claim</span>
                    ) : (
                      <span className="text-slate-400">after the period ends</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-500">No sales in this period yet.</p>
      )}
    </article>
  );
}

export function FundraiseProgress({
  fundraise,
  onRelease,
  releasing = false,
}: {
  fundraise: FundraiseView;
  onRelease?: () => void;
  releasing?: boolean;
}) {
  const target = fundraise.targetUsd ?? 0;
  const progress = target > 0 ? Math.min(100, (fundraise.raisedUsd / target) * 100) : 0;
  const policy = fundraise.policy ? POLICY_TEXT[fundraise.policy] : null;
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">
              {fundraise.collecting
                ? `Fundraising${fundraise.round ? ` · round ${fundraise.round + 1}` : ""}`
                : "Target reached"}
            </p>
            <h3 className="mt-2 text-2xl font-medium tracking-tight">
              {formatAmount(fundraise.raisedUsd)}{" "}
              <span className="text-base text-slate-500">raised toward {formatAmount(target)}</span>
            </h3>
          </div>
          <span className="text-sm font-semibold tabular-nums">
            {progress.toLocaleString("en-US", { maximumFractionDigits: 1 })}%
          </span>
        </div>
        <progress aria-label="Fundraising progress" max={100} value={progress} className="mt-4 w-full" />
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          {fundraise.collecting
            ? "The contract holds what is raised. Once the target is reached it is paid to the wallets below, at their fixed shares."
            : fundraise.policy === "direct"
              ? "The target was paid out. Every sale now sends its community share straight to the wallets below."
              : "The target was paid out and fundraising has ended. Sellers keep the community share of new sales."}
          {policy && fundraise.collecting && ` After a payout: ${policy.label.toLowerCase()}.`}
        </p>
        {fundraise.releasable && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
            <span>The target is reached. The payout is usually sent right after the sale that reached it.</span>
            {onRelease && (
              <button
                type="button"
                onClick={onRelease}
                disabled={releasing}
                className="rounded-full bg-navy-900 px-4 py-2 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-40"
              >
                {releasing ? "Paying out…" : "Pay out now"}
              </button>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-medium text-slate-900">Who receives the funds</h3>
        <p className="mt-1 text-xs text-slate-500">
          Fixed in the contract when the marketplace launched. Nobody can change them.
        </p>
        <div className="scroll-table">
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                <th className="py-2 font-medium">Recipient</th>
                <th className="py-2 text-right font-medium">Share</th>
                <th className="py-2 text-right font-medium">Per payout of {formatAmount(target)}</th>
              </tr>
            </thead>
            <tbody>
              {fundraise.recipients.map((r) => (
                <tr key={r.address} className="border-b border-slate-50 last:border-0">
                  <td className="py-2">
                    <span className="mr-2 font-medium text-slate-900">{r.label || r.name || "Recipient"}</span>
                    <WalletLink address={r.address} />
                  </td>
                  <td className="py-2 text-right tabular-nums">{percent(r.shareBps)}</td>
                  <td className="py-2 text-right tabular-nums">{formatAmount((target * r.shareBps) / 10_000)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {fundraise.releases.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-medium text-slate-900">Payouts</h3>
          <p className="mt-1 text-xs text-slate-500">
            {formatAmount(fundraise.totalReleasedUsd)} paid out in total.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {fundraise.releases.map((r) => (
              <li key={r.txHash} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                <span>
                  Round {r.round + 1} · <strong>{formatAmount(r.amountUsd)}</strong>
                </span>
                <a href={r.verifyUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                  Verify payout ↗
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
