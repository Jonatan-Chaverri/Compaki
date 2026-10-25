"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { InfoHint } from "@/components/info-hint";
import { FundraiseProgress, RewardsPeriodCard } from "@/components/community-fund";
import { communityFundSummary, type CommunityPayload } from "@/lib/community";
import { formatAmount, frequencyLabel, percent } from "@/lib/rewards";
import styles from "./community-overview.module.css";

function date(ts: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(ts * 1000)) + " UTC";
}
function Wallet({ address }: { address: string | null }) {
  const t = useTranslations("ui");
  return address ? <a className="public-wallet" href={`https://stellar.expert/explorer/testnet/${address.startsWith("C") ? "contract" : "account"}/${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer" aria-label={t("viewWalletValueOnStellar", { value1: address })}>{address}<span aria-hidden="true"> ↗</span></a> : <p>{t("recipientWalletNotAvailableYet")}</p>;
}
function Narrative({ title, text, fallback }: { title: string; text: string; fallback: string }) {
  return <div className={styles.narrative}><h3>{title}</h3><p>{text || fallback}</p></div>;
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
  const { balanceUsd, nextPoolUsd, previousUnclaimedUsd, period, rewards, fundraise } = communityFundSummary(data);
  const sourceWarning = data.verificationError ? t("verifiedContractUnavailable") : refreshError;
  const goal = mode === "classic" ? m.communityGoalUsd : fundraise?.targetUsd ?? null;
  // Classic targets track historical purchase contributions, not the account balance.
  const goalAmount = mode === "classic" ? data.sales.communityUsd : fundraise?.raisedUsd ?? null;
  const goalProgress = goal && goalAmount !== null ? Math.min(100, goalAmount / goal * 100) : null;
  const platformBps = Math.max(0, 10_000 - m.splits.vendorBps - m.splits.operatorBps - m.splits.communityBps);
  const splits = [
    { label: t("sellers"), bps: m.splits.vendorBps, className: styles.sellerShare },
    { label: t("communityMarketplaceLabel"), bps: m.splits.operatorBps, className: styles.marketShare },
    { label: t("community2"), bps: m.splits.communityBps, className: styles.communityShare },
    ...(platformBps ? [{ label: "Compaki", bps: platformBps, className: styles.platformShare }] : []),
  ];
  const money = (amount: number | null) => amount === null ? t("unavailable") : formatAmount(amount, locale);

  return <main id="main-content" tabIndex={-1} className={styles.page}>
    <div className={styles.topline}>
      <Link href={`/m/${m.slug}`} className="storefront-breadcrumb">{t("backTo")}{" "}{m.name}</Link>
      {data.canManage && communityEnabled && <Link href={`/dashboard/${m.slug}?tab=community`} className="text-link">{t("editCommunityStory")}</Link>}
    </div>
    <header className={styles.intro}>
      <p className="eyebrow">{t("valueCommunityTransparency", { value1: m.name })}</p>
      <h1>{t("communityImpactTitle")}</h1>
      <p>{communityEnabled ? t("communityImpactSubtitle", { percent: percent(m.splits.communityBps, locale) }) : t("seeHowThisMarketplaceSharesEachSaleWithItsSellersAnd")}</p>
    </header>
    {sourceWarning && <p role="alert" className={styles.warning}>{sourceWarning}</p>}

    {communityEnabled && <>
      <section className={styles.fundHero} aria-labelledby="community-balance-title">
        <span className={styles.fundIcon}><Icon name="leaf" className="h-6 w-6" /></span>
        <h2 id="community-balance-title">{t("communityBalanceTitle")}</h2>
        <p className={styles.balance} data-fund-balance>{money(balanceUsd)}</p>
        <p className={styles.balanceCaption}>{t(balanceUsd === null ? "communityBalanceUnavailable" : mode === "rewards" ? "communityBalanceRewardsCaption" : mode === "fundraise" ? "communityBalanceFundraiseCaption" : "communityBalanceClassicCaption")}</p>
        {balanceUsd === 0 && <p className={styles.zeroNote}>{t("communityFirstContribution")}</p>}

        <div className={styles.nextDistribution}>
          <div>
            <span className={styles.smallLabel}>{t("communityNextDistribution")}</span>
            {mode === "rewards" && <>
              <strong>{rewards?.periodEnd != null ? rewards.distributionDue ? t("communityDistributionDue") : date(rewards.periodEnd, locale) : t("communityScheduleUnavailable")}</strong>
              <p>{nextPoolUsd === null ? t("communityNextAmountUnavailable") : t("communityNextAmount", { amount: money(nextPoolUsd) })}</p>
            </>}
            {mode === "fundraise" && <>
              <strong>{fundraise ? !fundraise.collecting ? t("communityFundraiseComplete") : fundraise.releasable ? t("communityDistributionDue") : t("communityAtGoal", { amount: money(fundraise.targetUsd) }) : t("communityScheduleUnavailable")}</strong>
              <p>{t("communityGoalPayoutExplanation")}</p>
            </>}
            {mode === "classic" && <><strong>{t("communityOrganizerSchedule")}</strong><p>{t("communityClassicScheduleExplanation")}</p></>}
          </div>
          <a href="#community-recipients" className={styles.heroLink}>{t("communitySeeRecipients")}<Icon name="arrow" className="h-4 w-4" /></a>
        </div>
        {mode === "rewards" && previousUnclaimedUsd !== null && previousUnclaimedUsd > 0.00000005 && <p className={styles.pendingNote}>{t("communityPreviousUnclaimed", { amount: money(previousUnclaimedUsd) })}</p>}
      </section>
      <div className={styles.update}>
        <span>{t("lastUpdated")} {date(Math.floor(new Date(data.verifiedAt).getTime() / 1000), locale)}<InfoHint label={t("communityDataFreshness")}>{t("refreshesEvery30Seconds")}</InfoHint></span>
        <button disabled={busy} onClick={() => void refresh()} className="text-link disabled:opacity-40">{busy ? t("refreshing") : t("refreshInformation")}</button>
      </div>

      <section className={styles.purpose} aria-labelledby="community-purpose-title">
        <div className={styles.sectionHeader}><div><p className="eyebrow">{t("communityPurposeEyebrow")}</p><h2 id="community-purpose-title">{t("communityPurposeTitle")}</h2></div><Icon name="heart" className="h-6 w-6" /></div>
        <div className={styles.narratives}>
          <Narrative title={t("whatWeReWorkingToward")} text={m.communityPurpose} fallback={t("purposeFallback")} />
          <Narrative title={t("whoThisHelps")} text={m.communityBeneficiaries} fallback={t("beneficiariesFallback")} />
        </div>
        {m.communityDistribution && <details className={styles.organizerNote}><summary>{t("communityOrganizerPlan")}</summary><p>{m.communityDistribution}</p>{mode !== "classic" && <small>{t("communityPlanRulesNote")}</small>}</details>}
        <p className={styles.byline}>{t("publishedBy")} {m.operator.name}{m.communityDetailsUpdatedAt ? t("updatedValue", { value1: date(Math.floor(new Date(m.communityDetailsUpdatedAt).getTime() / 1000), locale) }) : ""}</p>
      </section>

      {goal != null && <section className={styles.goal}>
        <div><h2>{t(mode === "classic" ? "communityFundraisingGoal" : "communityRoundGoal")}</h2><strong>{money(goalAmount)} <span>/ {money(goal)}</span></strong></div>
        {goalProgress !== null && <progress aria-label={t("communityFundraisingProgress")} max={100} value={goalProgress} />}
        <p>{t(mode === "classic" ? "communityClassicGoalBasis" : "communityGoalPayoutExplanation")}</p>
      </section>}

      <section id="community-recipients" className={styles.section}>
        <div className={styles.sectionHeader}><div><p className="eyebrow">{t("communityDistributionEyebrow")}</p><h2>{t(mode === "rewards" ? "whoReceivesTheCommunityRewards" : mode === "fundraise" ? "whereDoesTheFundraisingGo" : "whoManagesTheCommunityFund")}</h2></div></div>
        {mode === "rewards" && (rewards ? <>
          <div className={styles.recipientGrid}>
            <article><Icon name="store" /><span>{t("sellers")}</span><strong>{rewards.vendorPoolBps === null ? "—" : percent(rewards.vendorPoolBps, locale)}</strong><p>{t("communitySellerRewardBasis")}</p></article>
            <article><Icon name="bag" /><span>{t("communityBuyersLabel")}</span><strong>{rewards.buyerPoolBps === null ? "—" : percent(rewards.buyerPoolBps, locale)}</strong><p>{t("communityBuyerRewardBasis")}</p></article>
            <article className={styles.frequency}><Icon name="people" /><span>{t("communityDistributionFrequency")}</span><strong>{frequencyLabel(rewards.periodSeconds, t)}</strong><p>{t("communityClaimExplanation")}</p></article>
          </div>
          {rewards.nextRules && <p className={styles.ruleNote}>{t("nextPeriodPending", { sellers: rewards.nextRules.vendorPoolBps / 100, buyers: 100 - rewards.nextRules.vendorPoolBps / 100, frequency: frequencyLabel(rewards.nextRules.periodSeconds, t) })}</p>}
          <div className={styles.recipientActions}>
            <Link href="/rewards" className="button-primary">{t("communityViewMyRewards")}<Icon name="arrow" className="h-4 w-4" /></Link>
            <span>{t("communityParticipationHint")}</span>
          </div>
          <details className={styles.disclosure}>
            <summary>{t("communityParticipantsAndPeriods")}{period && <span className={styles.count}>{period.participants.length}</span>}</summary>
            <div className={styles.periods}>{rewards.periods.map(item => <details key={item.periodId} className={styles.period} open={item.periodId === rewards.currentPeriod}>
              <summary>{t("period")} {item.periodId + 1}<span>{t(item.status === "current" ? "periodCollecting" : "periodEnded")}</span></summary>
              <RewardsPeriodCard period={item} ledger={rewards.ledgerTime ?? 0} />
            </details>)}<p className={styles.footnote}>{t("showingUpTo")} {data.historyLimit} {t("mostRecentPeriodsWithSalesFundTotalsAboveIncludeEveryPeriod")}</p></div>
          </details>
        </> : <p className={styles.unavailable}>{t("weCannotVerifyTheRewardsPeriodsRightNowTryRefreshingIn")}</p>)}
        {mode === "fundraise" && (fundraise ? <details className={styles.disclosure} open><summary>{t("communityFundraiseRecipients")}</summary><div className={styles.detailBody}><FundraiseProgress fundraise={fundraise} /></div></details> : <p className={styles.unavailable}>{t("weCannotVerifyTheFundraisingRightNowTryRefreshingInA")}</p>)}
        {mode === "classic" && <div className={styles.classicRecipient}><Icon name="people" /><h3>{m.communityFund?.name ?? t("communityFundAccount")}</h3><p>{m.communityDistribution || t("distributionFallback")}</p><details className={styles.organizerNote}><summary>{t("communityPaymentAccount")}</summary><Wallet address={m.communityFund?.address ?? null} /></details></div>}
      </section>
    </>}

    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><p className="eyebrow">{t("followTheMoney")}</p><h2>{t("communityEveryPurchase")}</h2><p>{t("communityEveryPurchaseExample", { amount: formatAmount(100, locale) })}</p></div></div>
      <div className={styles.splitBar} aria-label={splits.map(split => `${split.label} ${percent(split.bps, locale)}`).join(", ")}>{splits.map(split => <span key={split.label} className={split.className} style={{ flexGrow: split.bps }} />)}</div>
      <div className={styles.splitLegend}>{splits.map(split => <div key={split.label}><span className={split.className} /><p>{split.label}<strong>{percent(split.bps, locale)}</strong><small>{formatAmount(split.bps / 100, locale)}</small></p></div>)}</div>
      <details className={styles.disclosure}><summary>{t("communityPaymentAccounts")}</summary><div className={styles.accountList}>
        <div><h3>{t("sellers")}</h3><p>{t("thesePercentagesApplyToTheSaleAmountTheSellerReceivesThe")}</p>{m.sellers.length ? m.sellers.map((seller, i) => <div key={seller.address ?? i}><strong>{seller.name}</strong><Wallet address={seller.address} /></div>) : <p>{t("noSellersRegisteredYet")}</p>}</div>
        <div><h3>{t("communityMarketplaceLabel")} · {m.operator.name}</h3><Wallet address={m.operator.address} /></div>
        {communityEnabled && <div><h3>{t("communityFund")}</h3><Wallet address={mode === "classic" ? m.communityFund?.address ?? null : (rewards ?? fundraise)?.contractId ?? null} /></div>}
      </div></details>
    </section>

    <details className={styles.disclosure}>
      <summary>{t("communityHistoryTitle")}</summary>
      <div className={styles.detailBody}>
        <p className={styles.footnote}>{t("communityHistoryExplanation")}</p>
        <dl className={styles.history}>
          <div><dt>{t(data.sales.unclassifiedSales ? "recordedContributionsPartial" : "communityHistoricalContributions")}</dt><dd>{money(data.sales.communityUsd)}</dd></div>
          {rewards?.treasury && <><div><dt>{t("communityCurrentFundReceived")}</dt><dd>{money(rewards.treasury.contributedUsd)}</dd></div><div><dt>{t("claimedBySellersAndBuyers")}</dt><dd>{money(rewards.treasury.claimedUsd)}</dd></div></>}
          {fundraise && <><div><dt>{t("raisedInTotal")}</dt><dd>{money(fundraise.totalRaisedUsd)}</dd></div><div><dt>{t("paidOut")}</dt><dd>{money(fundraise.totalReleasedUsd)}</dd></div></>}
          <div><dt>{t("allRecordedSales")}</dt><dd>{money(data.sales.grossUsd)}</dd></div>
          <div><dt>{t("completedPurchases")}</dt><dd>{data.sales.salesCount.toLocaleString(locale)}</dd></div>
          <div><dt>{t("sellersReceived")}{data.sales.unclassifiedSales ? t("partial") : ""}</dt><dd>{money(data.sales.vendorUsd)}</dd></div>
          <div><dt>{t("marketplaceReceived")}{data.sales.unclassifiedSales ? t("partial") : ""}</dt><dd>{money(data.sales.operatorUsd)}</dd></div>
        </dl>
        {data.sales.unclassifiedSales > 0 && <p className={styles.warning}>{data.sales.unclassifiedSales} {t("historicalSaleSHaveAnUnreadableSplitRecordRecordedRecipientTotals")}</p>}
      </div>
    </details>
    <details className={styles.disclosure}>
      <summary>{t("aboutTheseNumbersAndPaymentAccounts")}</summary>
      <div className={styles.technical}><p>{t("purchaseTotalsComeFromCompletedSaleRecordsUsingTheSplitSaved")}</p>{mode !== "classic" ? <p>{t("purchaseContributionsCoverAllRecordedMarketplaceSalesVerifiedFundTotalsCover")}</p> : <p>{t("theCurrentAccountBalanceIsNotARecordOfTotalContributions")}</p>}<p>{t("communityCurrencyNote")}</p></div>
    </details>
  </main>;
}
