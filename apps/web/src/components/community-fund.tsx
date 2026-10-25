import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
// Shared views of a protected community fund (Community Rewards periods and
// fundraising progress), used by the operator dashboard and the public
// community page. Rules, pools, totals and recipients come from the
// contract; who took part comes from recorded sales.

import {
  getPolicyText,
  getStatusStyle,
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

function date(ts: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(ts * 1000));
}

export function WalletLink({ address }: { address: string }) {
  const t = useTranslations("ui");

  return (
    <a
      href={`https://stellar.expert/explorer/testnet/${address.startsWith("C") ? "contract" : "account"}/${encodeURIComponent(address)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-xs text-slate-400 underline decoration-dotted underline-offset-2 hover:text-slate-700"
      aria-label={t("viewWalletValueOnStellar", { value1: address })}
    >
      {shortAddress(address)} ↗
    </a>
  );
}

export function RewardsRules({ rewards, ledger }: { rewards: RewardsView; ledger: number }) {
  const locale = useLocale();

  const t = useTranslations("ui");

  const current = rewards.periods.find((p) => p.status === "current");
  return (
    <dl className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm sm:grid-cols-4">
      <div>
        <dt className="text-xs text-slate-500">{t("shared")}</dt>
        <dd className="mt-1 font-medium">{frequencyLabel(rewards.periodSeconds, t)}</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">{t("sellersPart")}</dt>
        <dd className="mt-1 font-medium">{percent(rewards.vendorPoolBps ?? 0, locale)} {" "}{t("bySales")}</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">{t("buyersPart")}</dt>
        <dd className="mt-1 font-medium">{percent(rewards.buyerPoolBps ?? 0, locale)} {" "}{t("byPurchases")}</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">{t("currentPeriod")}</dt>
        <dd className="mt-1 font-medium">
          {current ? t("periodValueEndsInValue", { value1: current.periodId + 1, value2: formatCountdown(current.endTs - ledger) }) : "—"}
        </dd>
      </div>
    </dl>
  );
}

export function RewardsPeriodCard({ period, ledger }: { period: PeriodView; ledger: number }) {
  const locale = useLocale();

  const t = useTranslations("ui");
  const STATUS_STYLE = getStatusStyle(t);

  // The ledger clock may pass the end between refreshes.
  const status = period.status === "current" && ledger >= period.endTs ? "ended" : period.status;
  const style = STATUS_STYLE[status];
  const pool = period.vendorPoolUsd + period.buyerPoolUsd;
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
            {t("period")}{" "}{period.periodId + 1}
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}>{style.label}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {date(period.startTs, locale)} → {date(period.endTs, locale)}
            {status === "current" && t("endsInValue2", { value1: formatCountdown(period.endTs - ledger) })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-slate-400">{t("rewardsPool")}</p>
          <p className="text-xl font-semibold tabular-nums text-slate-900">{formatAmount(pool, locale)}</p>
          <p className="text-xs text-slate-500">
            {formatAmount(period.vendorPoolUsd, locale)} {" "}{t("sellers4")}{" "}{formatAmount(period.buyerPoolUsd, locale)} {" "}{t("buyers2")}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {formatAmount(period.salesUsd, locale)} {" "}{t("soldIn")}{" "}{t("recordedSalesCount", { count: period.salesCount })}
        {status === "ended" && t("valueClaimedSoFar", { value1: formatAmount(period.claimedUsd, locale) })}
      </p>

      {period.participants.length > 0 ? (
        <div className="scroll-table">
          <table className="mt-4 w-full text-sm">
            <caption className="sr-only">{t("sellersAndBuyersOfPeriod")}{" "}{period.periodId + 1} {" "}{t("andTheirRewards")}</caption>
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                <th className="py-2 font-medium">{t("participant")}</th>
                <th className="py-2 text-right font-medium">{t("sold")}</th>
                <th className="py-2 text-right font-medium">{t("bought")}</th>
                <th className="py-2 text-right font-medium">{status === "ended" ? t("reward") : t("estimated")}</th>
                <th className="py-2 text-right font-medium">{t("status")}</th>
              </tr>
            </thead>
            <tbody>
              {period.participants.map((p) => (
                <tr key={p.address} className="border-b border-slate-50 last:border-0">
                  <td className="py-2">
                    <span className="mr-2 font-medium text-slate-900">{p.name ?? t("communityMember")}</span>
                    <WalletLink address={p.address} />
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-600">{p.soldUsd ? formatAmount(p.soldUsd, locale) : "—"}</td>
                  <td className="py-2 text-right tabular-nums text-slate-600">{p.boughtUsd ? formatAmount(p.boughtUsd, locale) : "—"}</td>
                  <td className="py-2 text-right font-semibold tabular-nums text-slate-900">{formatAmount(p.estimatedUsd, locale)}</td>
                  <td className="py-2 text-right text-xs">
                    {p.claimTxHash ? (
                      <a href={txUrl(p.claimTxHash)} target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">
                        {t("claimed")}</a>
                    ) : status === "ended" ? (
                      <span className="text-amber-700">{t("readyToClaim")}</span>
                    ) : (
                      <span className="text-slate-400">{t("afterThePeriodEnds")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-500">{t("noSalesInThisPeriodYet")}</p>
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
  const locale = useLocale();

  const t = useTranslations("ui");
  const POLICY_TEXT = getPolicyText(t);

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
                ? fundraise.round ? t("fundraisingRound", { round: fundraise.round + 1 }) : t("fundraisingvalue", { value1: "" })
                : t("targetReached")}
            </p>
            <h3 className="mt-2 text-2xl font-medium tracking-tight">
              {formatAmount(fundraise.raisedUsd, locale)}{" "}
              <span className="text-base text-slate-500">{t("raisedToward")}{" "}{formatAmount(target, locale)}</span>
            </h3>
          </div>
          <span className="text-sm font-semibold tabular-nums">
            {progress.toLocaleString(locale, { maximumFractionDigits: 1 })}%
          </span>
        </div>
        <progress aria-label={t("fundraisingProgress")} max={100} value={progress} className="mt-4 w-full" />
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          {fundraise.collecting
            ? t("theContractHoldsWhatIsRaisedOnceTheTargetIsReached")
            : fundraise.policy === "direct"
              ? t("theTargetWasPaidOutEverySaleNowSendsItsCommunity")
              : t("theTargetWasPaidOutAndFundraisingHasEndedSellersKeep")}
          {policy && fundraise.collecting && t("afterAPayoutValue", { value1: policy.label.toLowerCase() })}
        </p>
        {fundraise.releasable && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
            <span>{t("theTargetIsReachedThePayoutIsUsuallySentRightAfter")}</span>
            {onRelease && (
              <button
                type="button"
                onClick={onRelease}
                disabled={releasing}
                className="rounded-full bg-navy-900 px-4 py-2 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-40"
              >
                {releasing ? t("payingOut") : t("payOutNow")}
              </button>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-medium text-slate-900">{t("whoReceivesTheFunds")}</h3>
        <p className="mt-1 text-xs text-slate-500">
          {t("fixedInTheContractWhenTheMarketplaceLaunchedNobodyCanChange")}</p>
        <div className="scroll-table">
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                <th className="py-2 font-medium">{t("recipient")}</th>
                <th className="py-2 text-right font-medium">{t("share")}</th>
                <th className="py-2 text-right font-medium">{t("perPayoutOf")}{" "}{formatAmount(target, locale)}</th>
              </tr>
            </thead>
            <tbody>
              {fundraise.recipients.map((r) => (
                <tr key={r.address} className="border-b border-slate-50 last:border-0">
                  <td className="py-2">
                    <span className="mr-2 font-medium text-slate-900">{r.label || r.name || t("recipient")}</span>
                    <WalletLink address={r.address} />
                  </td>
                  <td className="py-2 text-right tabular-nums">{percent(r.shareBps, locale)}</td>
                  <td className="py-2 text-right tabular-nums">{formatAmount((target * r.shareBps) / 10_000, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {fundraise.releases.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-medium text-slate-900">{t("payouts")}</h3>
          <p className="mt-1 text-xs text-slate-500">
            {formatAmount(fundraise.totalReleasedUsd, locale)} {" "}{t("paidOutInTotal")}</p>
          <ul className="mt-3 space-y-2 text-sm">
            {fundraise.releases.map((r) => (
              <li key={r.txHash} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                <span>
                  {t("round")}{" "}{r.round + 1} · <strong>{formatAmount(r.amountUsd, locale)}</strong>
                </span>
                <a href={r.verifyUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                  {t("verifyPayout")}</a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
