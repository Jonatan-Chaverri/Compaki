"use client";
import { localizedMessage } from "@/i18n/errors";

import { useLocale } from "next-intl";

import { useTranslations } from "next-intl";

// Operator view of a protected community fund: Community Rewards periods or
// fundraising progress. Every rule, pool, total and recipient here comes
// from the Soroban contract via /api/rewards; who took part, names and
// explorer links come from Compaki's database. Refreshes every 10s so
// contributions appear right after a sale.

import { useEffect, useState } from "react";

import { FundraiseProgress, RewardsPeriodCard, RewardsRules } from "@/components/community-fund";
import { NextRulesForm, NextTargetForm } from "@/components/next-period-forms";
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
  const locale = useLocale();

  const t = useTranslations("ui");

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
        if (!res.ok) throw new Error(localizedMessage(body.error, t, t("requestFailedValue", { value1: res.status })));
        if (cancelled) return;
        setData(body);
        setFetchedAt(Date.now());
        setLoadError(null);
      } catch (err) {
        if (!cancelled) setLoadError(localizedMessage(err, t, t("couldNotLoadTheCommunityFund")));
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
  }, [slug, version, t]);

  const distribute = async () => {
    setTx({ state: "pending", label: t("distributingRewards") });
    try {
      const res = await fetch(`/api/rewards/marketplace/${encodeURIComponent(slug)}/distribute`, { method: "POST" });
      const result = (await res.json()) as { txHash?: string; error?: string };
      if (!res.ok || !result.txHash) throw new Error(localizedMessage(result.error, t, t("distributionFailed")));
      setTx({ state: "done", label: t("rewardsDistribution"), txHash: result.txHash });
      setVersion((v) => v + 1);
    } catch (err) {
      setTx({ state: "error", message: localizedMessage(err, t, t("distributionFailed")) });
    }
  };

  const release = async () => {
    setTx({ state: "pending", label: t("payingOutTheFundraisingTarget") });
    try {
      const res = await fetch(`/api/rewards/marketplace/${encodeURIComponent(slug)}/fundraise/release`, {
        method: "POST",
      });
      const result = (await res.json()) as { txHash?: string; error?: string };
      if (!res.ok || !result.txHash) throw new Error(localizedMessage(result.error, t, t("payoutFailed")));
      setTx({ state: "done", label: t("fundraisingPayout"), txHash: result.txHash });
      setVersion((v) => v + 1);
    } catch (err) {
      setTx({ state: "error", message: localizedMessage(err, t, t("payoutFailed")) });
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
            {t("readingTheCommunityFundFromTheContract")}</span>
        )}
      </section>
    );
  }

  const view = data.rewards ?? data.fundraise;
  if (!view?.bound) {
    return (
      <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        {t("theCommunityFundIsStillBeingSetUpForThisMarketplace")}</section>
    );
  }

  const ledger = ledgerNow(data.rewards?.ledgerTime ?? null, fetchedAt, now);

  return (
    <section className="mt-6 space-y-4">
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5">
        <p className="text-sm text-slate-700">
          <span className="font-medium text-slate-900">{percent(view.communityBps, locale)} {" "}{t("ofEverySale")}</span>{" "}
          {data.mode === "rewards"
            ? t("goesIntoAProtectedFundThatEveryPeriodIsSharedBetween")
            : t("goesIntoAProtectedFundUntilItReachesTheTargetThen")}{" "}
          {t("nobodyIncludingYouCanWithdrawItOrChangeTheseRules")}</p>
        <p className="mt-2 text-xs text-slate-500">
          {t("contract")}{" "}
          <a
            href={view.contractUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono underline decoration-dotted underline-offset-2 hover:text-slate-700"
          >
            {shortAddress(view.contractId)} ↗
          </a>{" "}
          {t("amountsIn")}{" "}{view.assetCode}{t("selfIssuedTestnetDemoMoneyNotCircleUsdc")}</p>
      </div>

      <TxBanner tx={tx} onDismiss={() => setTx({ state: "idle" })} />

      {data.rewards && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label={t("inTheRewardsFund")} value={formatAmount(data.rewards.treasury?.heldUsd ?? 0, locale)} accent />
            <Stat label={t("totalContributed")} value={formatAmount(data.rewards.treasury?.contributedUsd ?? 0, locale)} />
            <Stat label={t("claimedBySellersAndBuyers")} value={formatAmount(data.rewards.treasury?.claimedUsd ?? 0, locale)} />
          </div>
          <RewardsRules rewards={data.rewards} ledger={ledger} />
          {(data.rewards.distributionDue || (data.rewards.periodEnd !== null && ledger >= data.rewards.periodEnd)) && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <span>{t("distributionDueNow")}</span>
              <button
                type="button"
                onClick={() => void distribute()}
                disabled={tx.state === "pending"}
                className="rounded-full bg-navy-900 px-4 py-2 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-40"
              >
                {t("distributeNow")}
              </button>
            </div>
          )}
          {data.canManage && (
            <NextRulesForm slug={slug} rewards={data.rewards} onSaved={() => setVersion((v) => v + 1)} />
          )}
          <div className="space-y-3">
            {data.rewards.periods.map((p) => (
              <RewardsPeriodCard key={p.periodId} period={p} ledger={ledger} />
            ))}
          </div>
        </>
      )}

      {data.fundraise && (
        <>
          <FundraiseProgress
            fundraise={data.fundraise}
            onRelease={() => void release()}
            releasing={tx.state === "pending"}
          />
          {data.canManage && (
            <NextTargetForm slug={slug} fundraise={data.fundraise} onSaved={() => setVersion((v) => v + 1)} />
          )}
        </>
      )}

      {data.canManage && <GuaranteeChecks slug={slug} mode={data.mode} />}

      <details className="pt-2 text-xs leading-relaxed text-slate-500">
        <summary className="cursor-pointer">{t("howTheseNumbersAreVerified")}</summary>
        <p className="mt-2">
          {t("rulesPoolsTotalsAndRecipientsAreReadFromStellarOnEvery")}</p>
        <p className="mt-2">{t("upgradeNotice")}</p>
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
  const t = useTranslations("ui");

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
      if (!res.ok) throw new Error(localizedMessage(body.error, t, t("checkFailed")));
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
        [kind]: { state: "error", message: localizedMessage(err, t, t("checkFailed")) },
      }));
    }
  };

  const checks: { kind: CheckKind; title: string; detail: string }[] = [
    {
      kind: "withdraw",
      title: t("withdrawTheFundToYourAccount"),
      detail: t("youMoveTheSavedTokensStraightOutOfTheContractVia"),
    },
    ...(mode === "rewards"
      ? [
          {
            kind: "claim-for-someone" as const,
            title: t("claimABuyerSRewardForThem"),
            detail: t("youSignAClaimForOneOfThisPeriodSParticipants"),
          },
        ]
      : []),
  ];

  return (
    <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer font-medium text-slate-900">{t("howIsTheCommunityFundProtected")}</summary>
      <p className="mt-0.5 text-sm text-slate-500">
        {t("eachCheckEvaluatesTheActionWithYourOperatorSignatureAgainstThe")}</p>
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
                  <p className="mt-1 text-xs text-slate-600">{localizedMessage(r.message, t, t("checkNotApplicable"))}</p>
                )}
                {r.state === "done" && r.applicable && r.rejected && (
                  <p className="mt-1 text-xs text-emerald-700">
                    {t("rejectedByTheContract")}{" "}<code className="font-mono">{r.reason}</code>
                    {r.control && <span className="text-slate-500"> {" "}{t("control")}{" "}{r.control}</span>}
                  </p>
                )}
                {r.state === "done" && r.applicable && !r.rejected && (
                  <p className="mt-1 text-xs font-medium text-red-700">
                    {t("theActionWasNotRejectedReportThis")}</p>
                )}
                {r.state === "error" && <p className="mt-1 text-xs text-red-600">{localizedMessage(r.message, t, t("checkFailed"))}</p>}
              </div>
              <button
                onClick={() => void check(c.kind)}
                disabled={r.state === "running"}
                className="shrink-0 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                {r.state === "running" ? t("checking") : t("checkProtection")}
              </button>
            </div>
          );
        })}
      </div>
    </details>
  );
}
