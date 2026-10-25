"use client";
import { useLocale } from "next-intl";

import { useTranslations } from "next-intl";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/shell";
import type { CommunityPayload } from "@/lib/community";
import { FundraiseProgress, RewardsPeriodCard, RewardsRules } from "@/components/community-fund";
import { formatAmount, percent } from "@/lib/rewards";

function date(ts: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(ts * 1000)) + " UTC";
}
function Wallet({ address }: { address: string | null }) {
  const t = useTranslations("ui");

  return address ? <a className="public-wallet" href={`https://stellar.expert/explorer/testnet/${address.startsWith("C") ? "contract" : "account"}/${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer" aria-label={t("viewWalletValueOnStellar", { value1: address })}>{address}<span aria-hidden="true"> ↗</span></a> : <p className="mt-2 text-xs text-slate-500">{t("recipientWalletNotAvailableYet")}</p>;
}
function Stat({ label, amount, detail }: { label: string; amount: number | null; detail: string }) {
  const locale = useLocale();

  const t = useTranslations("ui");

  return <div className="community-stat"><p>{label}</p><strong>{amount === null ? t("unavailable") : formatAmount(amount, locale)}</strong><span>{detail}</span></div>;
}
function Narrative({ title, text, fallback }: { title: string; text: string; fallback: string }) {
  return <section className="community-narrative"><h2>{title}</h2><p className={text ? "" : "text-slate-500 italic"}>{text || fallback}</p></section>;
}
export function CommunityOverview({ initial }: { initial: CommunityPayload }) {
  const locale = useLocale();

  const t = useTranslations("ui");

  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/marketplaces/${encodeURIComponent(initial.marketplace.slug)}/community`, { cache: "no-store", signal });
      if (!response.ok) throw new Error(t("couldNotRefresh"));
      const updated = await response.json() as CommunityPayload;
      if (signal?.aborted) return;
      setData(updated); setRefreshError(null);
    } catch { if (!signal?.aborted) setRefreshError(t("refreshUnavailableTheInformationBelowIsFromTheLastSuccessfulUpdate")); }
    finally { inFlight.current = false; if (!signal?.aborted) setBusy(false); }
  }, [initial.marketplace.slug, t]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setInterval(() => { void refresh(controller.signal); }, 30_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [refresh]);
  const m = data.marketplace;
  const communityEnabled = m.splits.communityBps > 0;
  const mode = m.communityMode;
  const rewards = mode === "rewards" ? data.rewards : null;
  const fundraise = mode === "fundraise" ? data.fundraise : null;
  const contributed = data.sales.communityUsd;
  const goal = mode === "classic" ? m.communityGoalUsd : null;
  const progress = goal && contributed !== null ? contributed / goal * 100 : null;
  const ledger = rewards?.ledgerTime ?? 0;
  const sourceWarning = data.verificationError ? t("verifiedContractUnavailable") : refreshError;

  return <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-12">
    <Link href={`/m/${m.slug}`} className="storefront-breadcrumb">{t("backTo")}{" "}{m.name}</Link>
    <PageHeading eyebrow={t("valueCommunityTransparency", { value1: m.name })} title={t("theGoodBehindYourPurchase")} description={communityEnabled ? t("valueOfEachSaleGoesToThisMarketplaceSCommunityFund", { value1: percent(m.splits.communityBps, locale) }) : t("seeHowThisMarketplaceSharesEachSaleWithItsSellersAnd")}>
      {data.canManage && communityEnabled && <Link href={`/dashboard/${m.slug}?tab=community`} className="button-secondary button-small">{t("editCommunityStory")}<Icon name="arrow" className="h-4 w-4" /></Link>}
    </PageHeading>
    <div className="community-update"><span>{t("lastUpdated")}{" "}{date(Math.floor(new Date(data.verifiedAt).getTime() / 1000), locale)} {" "}{t("refreshesEvery30Seconds")}</span><button disabled={busy} onClick={() => void refresh()} className="text-link disabled:opacity-40">{busy ? t("refreshing") : t("refreshInformation")}</button></div>
    {sourceWarning && <p role="alert" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-800">{sourceWarning}</p>}
    {communityEnabled && <>
      <div className={`community-stats ${mode !== "classic" ? "community-stats-four" : ""}`}><Stat label={data.sales.unclassifiedSales ? t("recordedContributionsPartial") : t("recordedCommunityContributions")} amount={contributed} detail={t("contributionSalesDetail")} />
        {mode === "rewards" && <><Stat label={t("intoTheCurrentRewardsFund")} amount={rewards?.treasury?.contributedUsd ?? null} detail={t("currentContributionsDetail")} /><Stat label={t("inTheFundNow")} amount={rewards?.treasury?.heldUsd ?? null} detail={t("waitingForClaimsDetail")} /><Stat label={t("claimedBySellersAndBuyers")} amount={rewards?.treasury?.claimedUsd ?? null} detail={t("verifiedPaymentsDetail")} /></>}
        {mode === "fundraise" && <><Stat label={t("raisedThisRound")} amount={fundraise?.bound ? fundraise.raisedUsd : null} detail={fundraise?.targetUsd ? t("fundTargetDetail", { amount: formatAmount(fundraise.targetUsd, locale) }) : t("verifiedContract")} /><Stat label={t("raisedInTotal")} amount={fundraise?.bound ? fundraise.totalRaisedUsd : null} detail={t("everyRoundVerified")} /><Stat label={t("paidOut")} amount={fundraise?.bound ? fundraise.totalReleasedUsd : null} detail={t("sentRecipientAccounts")} /></>}
        {mode === "classic" && <><Stat label={t("inTheFundNow")} amount={data.communityBalanceUsd} detail={t("liveBalanceDetail")} /><div className="community-stat"><p>{t("completedPurchases")}</p><strong>{data.sales.salesCount.toLocaleString(locale)}</strong><span>{t("recordedAcrossThisMarketplaceSFullSalesHistory")}</span></div></>}
      </div>
      {mode !== "classic" && <p className="mb-6 text-xs leading-relaxed text-slate-500">{t("purchaseContributionsCoverAllRecordedMarketplaceSalesVerifiedFundTotalsCover")}</p>}
      {data.sales.unclassifiedSales > 0 && <p className="mb-6 text-xs text-amber-800">{data.sales.unclassifiedSales} {" "}{t("historicalSaleSHaveAnUnreadableSplitRecordRecordedRecipientTotals")}</p>}
      {goal != null && <section className="community-goal"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">{t("communityFundraisingGoal")}</p><h2 className="mt-2 text-2xl font-medium tracking-tight">{contributed === null ? t("contributionTotalUnavailable") : t("valueContributed", { value1: formatAmount(contributed, locale) })} <span className="text-base text-slate-500">{t("toward")}{" "}{formatAmount(goal, locale)}</span></h2></div>{progress !== null && <span className="text-sm font-semibold">{progress.toLocaleString(locale, { maximumFractionDigits: 1 })}%</span>}</div>{progress !== null && <progress aria-label={t("communityFundraisingProgress")} max={100} value={Math.min(100, progress)} className="mt-5 w-full" />}<p className="mt-3 text-xs leading-relaxed text-slate-500">{t("thisIsTheOrganizerSTargetMeasuredAgainstCommunityContributionsFrom")}{" "}{data.sales.unclassifiedSales > 0 && t("progressIsPartialBecauseSomeHistoricalRecordsCannotBeRead")}</p></section>}
      <div className="community-story"><div className="community-story-heading"><span className="empty-icon"><Icon name="leaf" className="h-6 w-6" /></span><div><p className="eyebrow">{t("inTheOrganizerSWords")}</p><h2>{t("aPurposeWorthSharing")}</h2><p>{t("publishedBy")}{" "}{m.operator.name}{m.communityDetailsUpdatedAt ? t("updatedValue", { value1: date(Math.floor(new Date(m.communityDetailsUpdatedAt).getTime() / 1000), locale) }) : ""}</p></div></div><Narrative title={t("whatWeReWorkingToward")} text={m.communityPurpose} fallback={t("purposeFallback")} /><Narrative title={t("whoThisHelps")} text={m.communityBeneficiaries} fallback={t("beneficiariesFallback")} /><Narrative title={t("howAndWhenFundsAreShared")} text={m.communityDistribution} fallback={mode === "classic" ? t("distributionFallback") : t("contractRulesFallback")} /></div>
    </>}
    <section className="community-section"><p className="eyebrow">{t("followTheMoney")}</p><h2>{t("whereEvery")}{" "}{formatAmount(100, locale)} {" "}{t("goes")}</h2><p className="section-copy mt-3">{t("thesePercentagesApplyToTheSaleAmountTheSellerReceivesThe")}</p><div className="community-split-bar" aria-label={t("sellersValueMarketplaceValueCommunityValue", { value1: percent(m.splits.vendorBps, locale), value2: percent(m.splits.operatorBps, locale), value3: percent(m.splits.communityBps, locale) })}><span style={{ width: `${m.splits.vendorBps / 100}%`, background: "#254d38" }} /><span style={{ width: `${m.splits.operatorBps / 100}%`, background: "#d2ac7d" }} /><span style={{ width: `${m.splits.communityBps / 100}%`, background: "#92ab6c" }} /></div><div className="community-destinations"><div><Icon name="store" /><h3>{t("sellers2")}{" "}{percent(m.splits.vendorBps, locale)}</h3><p>{formatAmount(m.splits.vendorBps / 100, locale)} {" "}{t("per")}{" "}{formatAmount(100, locale)} {" "}{t("inSalesOfTheirProducts")}</p><details className="mt-4 text-xs"><summary className="cursor-pointer font-medium">{t("registeredSellerWallets")}{m.sellers.length})</summary>{m.sellers.length === 0 ? <p>{t("noSellersRegisteredYet")}</p> : m.sellers.map((seller, i) => <div key={seller.address ?? i} className="mt-4 border-t border-slate-100 pt-3"><strong>{seller.name}</strong><Wallet address={seller.address} /></div>)}</details></div><div><Icon name="people" /><h3>{t("marketplace")}{" "}{percent(m.splits.operatorBps, locale)}</h3><p>{formatAmount(m.splits.operatorBps / 100, locale)} {" "}{t("to")}{" "}{m.operator.name} {" "}{t("per")}{" "}{formatAmount(100, locale)} {" "}{t("inSales")}</p><Wallet address={m.operator.address} /></div><div><Icon name="leaf" /><h3>{t("community")}{" "}{percent(m.splits.communityBps, locale)}</h3><p>{formatAmount(m.splits.communityBps / 100, locale)} {" "}{t("per")}{" "}{formatAmount(100, locale)} {" "}{t("inSales")}{communityEnabled ? mode === "rewards" ? t("heldInTheProtectedRewardsFund") : mode === "fundraise" ? t("heldInTheProtectedFundraisingFund") : t("sentDirectlyToTheCommunityAccountWithEachSale") : ""}</p>{communityEnabled ? <Wallet address={mode === "classic" ? m.communityFund?.address ?? null : (rewards ?? fundraise)?.bound ? (rewards ?? fundraise)!.contractId : null} /> : <p>{t("noCommunityContributionIsEnabled")}</p>}</div></div></section>
    <section className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:grid-cols-3" aria-label={t("recordedLifetimeMarketplaceEarnings")}><div><p className="text-xs text-slate-500">{t("allRecordedSales")}</p><p className="mt-2 text-xl font-medium">{formatAmount(data.sales.grossUsd, locale)}</p></div><div><p className="text-xs text-slate-500">{t("sellersReceived")}{data.sales.unclassifiedSales > 0 ? t("partial") : ""}</p><p className="mt-2 text-xl font-medium">{formatAmount(data.sales.vendorUsd, locale)}</p></div><div><p className="text-xs text-slate-500">{t("marketplaceReceived")}{data.sales.unclassifiedSales > 0 ? t("partial") : ""}</p><p className="mt-2 text-xl font-medium">{formatAmount(data.sales.operatorUsd, locale)}</p></div></section>
    {communityEnabled && <section className="community-section"><p className="eyebrow">{t("fromContributionToRecipient")}</p><h2>{mode === "rewards" ? t("whoReceivesTheCommunityRewards") : mode === "fundraise" ? t("whereDoesTheFundraisingGo") : t("whoManagesTheCommunityFund")}</h2>
      {mode === "rewards" && <><p className="section-copy mb-6 mt-3">{t("everyPeriodTheFundIsSharedBetweenThePeopleWhoSold")}</p>
        {rewards?.bound ? <div className="space-y-4"><RewardsRules rewards={rewards} ledger={ledger} />{rewards.periods.map(period => <RewardsPeriodCard key={period.periodId} period={period} ledger={ledger} />)}<p className="text-xs text-slate-500">{t("showingUpTo")}{" "}{data.historyLimit} {" "}{t("mostRecentPeriodsWithSalesFundTotalsAboveIncludeEveryPeriod")}</p></div> : <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-500">{t("weCannotVerifyTheRewardsPeriodsRightNowTryRefreshingIn")}</div>}
        <Link href="/rewards" className="button-secondary mt-6">{t("soldOrBoughtHereSeeYourRewards")}<Icon name="arrow" className="h-4 w-4" /></Link></>}
      {mode === "fundraise" && <><p className="section-copy mb-6 mt-3">{t("theCommunityShareOfEverySaleIsSavedInTheContract")}</p>
        {fundraise?.bound ? <FundraiseProgress fundraise={fundraise} /> : <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-500">{t("weCannotVerifyTheFundraisingRightNowTryRefreshingInA")}</div>}</>}
      {mode === "classic" && <div className="community-period mt-5"><h3 className="text-lg font-medium">{m.communityFund?.name ?? t("communityFundAccount")}</h3><Wallet address={m.communityFund?.address ?? null} /><p className="mt-4 text-sm leading-relaxed text-slate-600">{t("theCommunityShareReachesThisAccountWithEachCompletedPurchaseAny")}</p><p className="mt-3 text-xs leading-relaxed text-slate-500">{t("theCurrentAccountBalanceIsNotARecordOfTotalContributions")}</p></div>}
    </section>}
    <details className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 text-xs leading-relaxed text-slate-500"><summary className="cursor-pointer font-medium text-slate-700">{t("aboutTheseNumbersAndPaymentAccounts")}</summary><p className="mt-3">{t("purchaseTotalsComeFromCompletedSaleRecordsUsingTheSplitSaved")}</p>{mode !== "classic" && <p className="mt-3">{t("upgradeNotice")}</p>}</details>
  </main>;
}
