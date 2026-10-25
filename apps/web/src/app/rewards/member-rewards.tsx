"use client";
import { localizedMessage } from "@/i18n/errors";

import { useLocale } from "next-intl";

import { useTranslations } from "next-intl";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { EmptyState } from "@/components/shell";
import { useCompakiWallet } from "@/components/cavos-provider";
import { TxBanner, type TxState } from "@/components/tx-banner";
import {
  getStatusStyle,
  formatAmount,
  formatCountdown,
  formatTs,
  ledgerNow,
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
  soldUsd: number;
  boughtUsd: number;
  /** Read from the contract: final once the period ended, an estimate before. */
  amountUsd: number;
  claimed: boolean;
  claimTxHash: string | null;
}

export interface MemberRewardsPayload {
  address: string | null;
  marketplaces: {
    name: string;
    slug: string;
    ledgerTime: number | null;
    vendorPoolBps: number;
    buyerPoolBps: number;
    periods: MemberPeriod[];
  }[];
}

export function MemberRewards({ initial }: { initial: MemberRewardsPayload }) {
  const locale = useLocale();

  const t = useTranslations("ui");
  const STATUS_STYLE = getStatusStyle(t);

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
      // Own wallets sign the claim here (202 + transaction to approve);
      // custodial accounts are signed by the API.
      const result = await followSignatures<{ txHash?: string; amountUsd?: number }>(
        await readResult(await fetch(url, { method: "POST" })),
        wallet.signXdr,
        () => setTx({ state: "pending", label: t("approveInYourWallet") }),
      );
      const body = result.body;
      if (result.status !== 200 || !body.txHash) throw new Error(localizedMessage(body.error, t, t("transactionFailed")));
      setTx({
        state: "done",
        label: body.amountUsd !== undefined ? t("valueValueReceived", { value1: label, value2: formatAmount(body.amountUsd, locale) }) : label,
        txHash: body.txHash,
      });
      await reload();
    } catch (err) {
      setTx({ state: "error", message: localizedMessage(err, t, t("transactionFailed")) });
    } finally {
      setBusy(null);
    }
  };

  if (data.marketplaces.length === 0) {
    return (
      <div className="mt-8"><EmptyState icon="leaf" title={t("yourNextChapterOfSharedGood")} description={t("whenYouSellOrBuyInAMarketplaceWithCommunityRewards")} href="/marketplaces" action={t("exploreYourCommunities")} />
        {data.address && <details className="mt-4 rounded-xl border border-slate-200 p-4 text-xs text-slate-500"><summary className="cursor-pointer">{t("yourPaymentAccountDetails")}</summary><p className="mt-3 break-all font-mono">{data.address}</p></details>}
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
                  {t("paidTo")}{" "}{shortAddress(data.address)}
                </span>
              )}
            </h2>
            <div className="mt-3 space-y-3">
              {m.periods.map((p) => {
                const status: PeriodStatus = p.status === "current" && ledger >= p.endTs ? "ended" : p.status;
                const key = `${m.slug}:${p.periodId}`;
                const how = [
                  p.soldUsd > 0 && t("youSoldValue", { value1: formatAmount(p.soldUsd, locale) }),
                  p.boughtUsd > 0 && t("youBoughtValue", { value1: formatAmount(p.boughtUsd, locale) }),
                ].filter(Boolean).join(t("and"));
                return (
                  <div
                    key={key}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div>
                      <p className="flex items-center gap-2 font-medium text-slate-900">
                        {t("period")}{" "}{p.periodId + 1}
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status].className}`}
                        >
                          {STATUS_STYLE[status].label}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {how ? t("inThisPeriodValue", { value1: how }) : t("youTookPartInThisPeriod")} ·{" "}
                        {status === "current"
                          ? t("endsInValue", { value1: formatCountdown(p.endTs - ledger) })
                          : t("endedValue", { value1: formatTs(p.endTs, locale) })}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-wider text-slate-400">
                          {status === "current" ? t("growingReward") : t("yourReward")}
                        </p>
                        <p className="text-xl font-semibold tabular-nums text-emerald-600">
                          {formatAmount(p.amountUsd, locale)}
                        </p>
                      </div>
                      {status === "current" && (
                        <span className="text-xs text-slate-400">{t("claimItWhenThePeriodEnds")}</span>
                      )}
                      {status === "ended" && p.claimed && (
                        <span className="text-xs font-medium text-emerald-700">
                          {t("collected")}{p.claimTxHash && (
                            <a
                              href={txUrl(p.claimTxHash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 font-normal text-slate-400 underline decoration-dotted underline-offset-2 hover:text-slate-700"
                            >
                              {t("viewPayment")}</a>
                          )}
                        </span>
                      )}
                      {status === "ended" && !p.claimed && p.amountUsd > 0 && (
                        <button
                          onClick={() =>
                            void act(
                              key,
                              t("claimingPeriod", { period: p.periodId + 1 }),
                              t("claimedPeriod", { period: p.periodId + 1 }),
                              `/api/rewards/marketplace/${m.slug}/periods/${p.periodId}/claim`,
                            )
                          }
                          disabled={busy !== null}
                          className="rounded-full bg-navy-900 px-5 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-40"
                        >
                          {busy === key ? t("collecting") : t("collectReward")}
                        </button>
                      )}
                      {status === "ended" && !p.claimed && p.amountUsd === 0 && (
                        <span className="text-xs text-slate-400">{t("noRewardThisPeriod")}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      <details className="rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-500"><summary className="cursor-pointer font-medium text-slate-700">{t("howYourRewardsAndPaymentAccountWork")}</summary><p className="mt-3">{t("eachPeriodTheMarketplaceSRewardsFundIsSharedBetweenIts")}</p></details>
    </div>
  );
}
