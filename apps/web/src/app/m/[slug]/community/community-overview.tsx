"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/shell";
import type { CommunityPayload } from "@/lib/community";
import { FundraiseProgress, RewardsPeriodCard, RewardsRules } from "@/components/community-fund";
import { formatAmount, percent } from "@/lib/rewards";

function date(ts: number) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(ts * 1000)) + " UTC";
}
function Wallet({ address }: { address: string | null }) {
  return address ? <a className="public-wallet" href={`https://stellar.expert/explorer/testnet/${address.startsWith("C") ? "contract" : "account"}/${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer" aria-label={`View wallet ${address} on Stellar`}>{address}<span aria-hidden="true"> ↗</span></a> : <p className="mt-2 text-xs text-slate-500">Recipient wallet not available yet.</p>;
}
function Stat({ label, amount, detail }: { label: string; amount: number | null; detail: string }) {
  return <div className="community-stat"><p>{label}</p><strong>{amount === null ? "Unavailable" : formatAmount(amount)}</strong><span>{detail}</span></div>;
}
function Narrative({ title, text, fallback }: { title: string; text: string; fallback: string }) {
  return <section className="community-narrative"><h2>{title}</h2><p className={text ? "" : "text-slate-500 italic"}>{text || fallback}</p></section>;
}
export function CommunityOverview({ initial }: { initial: CommunityPayload }) {
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
      if (!response.ok) throw new Error("Could not refresh");
      const updated = await response.json() as CommunityPayload;
      if (signal?.aborted) return;
      setData(updated); setRefreshError(null);
    } catch { if (!signal?.aborted) setRefreshError("Refresh unavailable. The information below is from the last successful update."); }
    finally { inFlight.current = false; if (!signal?.aborted) setBusy(false); }
  }, [initial.marketplace.slug]);
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
  const sourceWarning = data.verificationError || refreshError;

  return <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-12">
    <Link href={`/m/${m.slug}`} className="storefront-breadcrumb">← Back to {m.name}</Link>
    <PageHeading eyebrow={`${m.name} · Community & transparency`} title="The good behind your purchase." description={communityEnabled ? `${percent(m.splits.communityBps)} of each sale goes to this marketplace’s community fund. See what it supports, where the money goes, and who receives it.` : "See how this marketplace shares each sale with its sellers and organizer."}>
      {data.canManage && communityEnabled && <Link href={`/dashboard/${m.slug}?tab=community`} className="button-secondary button-small">Edit community story<Icon name="arrow" className="h-4 w-4" /></Link>}
    </PageHeading>
    <div className="community-update"><span>Last updated: {date(Math.floor(new Date(data.verifiedAt).getTime() / 1000))} · Refreshes every 30 seconds</span><button disabled={busy} onClick={() => void refresh()} className="text-link disabled:opacity-40">{busy ? "Refreshing…" : "Refresh information"}</button></div>
    {sourceWarning && <p role="alert" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-800">{sourceWarning}</p>}
    {communityEnabled && <>
      <div className={`community-stats ${mode !== "classic" ? "community-stats-four" : ""}`}><Stat label={data.sales.unclassifiedSales ? "Recorded contributions (partial)" : "Recorded community contributions"} amount={contributed} detail="Community share of all recorded completed sales" />
        {mode === "rewards" && <><Stat label="Into the current rewards fund" amount={rewards?.treasury?.contributedUsd ?? null} detail="Verified contributions to the current fund contract" /><Stat label="In the fund now" amount={rewards?.treasury?.heldUsd ?? null} detail="Waiting to be claimed by sellers and buyers" /><Stat label="Claimed by sellers and buyers" amount={rewards?.treasury?.claimedUsd ?? null} detail="Verified payments from the current fund contract" /></>}
        {mode === "fundraise" && <><Stat label="Raised this round" amount={fundraise?.bound ? fundraise.raisedUsd : null} detail={fundraise?.targetUsd ? `Toward a ${formatAmount(fundraise.targetUsd)} target` : "Verified from the contract"} /><Stat label="Raised in total" amount={fundraise?.bound ? fundraise.totalRaisedUsd : null} detail="Every round, verified from the contract" /><Stat label="Paid out" amount={fundraise?.bound ? fundraise.totalReleasedUsd : null} detail="Sent to the recipient wallets" /></>}
        {mode === "classic" && <><Stat label="In the fund now" amount={data.communityBalanceUsd} detail="Live account balance; may also include other transfers" /><div className="community-stat"><p>Completed purchases</p><strong>{data.sales.salesCount.toLocaleString("en-US")}</strong><span>Recorded across this marketplace’s full sales history</span></div></>}
      </div>
      {mode !== "classic" && <p className="mb-6 text-xs leading-relaxed text-slate-500">Purchase contributions cover all recorded marketplace sales. Verified fund totals cover only the current fund contract. They can differ after a fund migration; balances and payments in earlier contracts are not included in current fund totals.</p>}
      {data.sales.unclassifiedSales > 0 && <p className="mb-6 text-xs text-amber-800">{data.sales.unclassifiedSales} historical sale(s) have an unreadable split record. Recorded recipient totals exclude those records; verified rewards fund totals are independent.</p>}
      {goal != null && <section className="community-goal"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Community fundraising goal</p><h2 className="mt-2 text-2xl font-medium tracking-tight">{contributed === null ? "Contribution total unavailable" : `${formatAmount(contributed)} contributed`} <span className="text-base text-slate-500">toward {formatAmount(goal)}</span></h2></div>{progress !== null && <span className="text-sm font-semibold">{progress.toLocaleString("en-US", { maximumFractionDigits: 1 })}%</span>}</div>{progress !== null && <progress aria-label="Community fundraising progress" max={100} value={Math.min(100, progress)} className="mt-5 w-full" />}<p className="mt-3 text-xs leading-relaxed text-slate-500">This is the organizer’s target, measured against community contributions from recorded completed sales. It is not the current spendable balance and does not trigger a payment. {data.sales.unclassifiedSales > 0 && "Progress is partial because some historical records cannot be read."}</p></section>}
      <div className="community-story"><div className="community-story-heading"><span className="empty-icon"><Icon name="leaf" className="h-6 w-6" /></span><div><p className="eyebrow">In the organizer’s words</p><h2>A purpose worth sharing.</h2><p>Published by {m.operator.name}{m.communityDetailsUpdatedAt ? ` · Updated ${date(Math.floor(new Date(m.communityDetailsUpdatedAt).getTime() / 1000))}` : ""}</p></div></div><Narrative title="What we’re working toward" text={m.communityPurpose} fallback="The organizer hasn’t published a community purpose yet." /><Narrative title="Who this helps" text={m.communityBeneficiaries} fallback="The organizer hasn’t described the intended community beneficiaries yet. Verified payment recipients, when available, appear below." /><Narrative title="How and when funds are shared" text={m.communityDistribution} fallback={mode === "classic" ? "The organizer hasn’t published a distribution explanation yet. The payment mechanism is described below." : "The rules are enforced by the contract and shown below."} /></div>
    </>}
    <section className="community-section"><p className="eyebrow">Follow the money</p><h2>Where every {formatAmount(100)} goes.</h2><p className="section-copy mt-3">These percentages apply to the sale amount. The seller receives the share for their own products; it is not divided among all sellers.</p><div className="community-split-bar" aria-label={`Sellers ${percent(m.splits.vendorBps)}, marketplace ${percent(m.splits.operatorBps)}, community ${percent(m.splits.communityBps)}`}><span style={{ width: `${m.splits.vendorBps / 100}%`, background: "#254d38" }} /><span style={{ width: `${m.splits.operatorBps / 100}%`, background: "#d2ac7d" }} /><span style={{ width: `${m.splits.communityBps / 100}%`, background: "#92ab6c" }} /></div><div className="community-destinations"><div><Icon name="store" /><h3>Sellers · {percent(m.splits.vendorBps)}</h3><p>{formatAmount(m.splits.vendorBps / 100)} per {formatAmount(100)} in sales of their products.</p><details className="mt-4 text-xs"><summary className="cursor-pointer font-medium">Registered seller wallets ({m.sellers.length})</summary>{m.sellers.length === 0 ? <p>No sellers registered yet.</p> : m.sellers.map((seller, i) => <div key={seller.address ?? i} className="mt-4 border-t border-slate-100 pt-3"><strong>{seller.name}</strong><Wallet address={seller.address} /></div>)}</details></div><div><Icon name="people" /><h3>Marketplace · {percent(m.splits.operatorBps)}</h3><p>{formatAmount(m.splits.operatorBps / 100)} to {m.operator.name} per {formatAmount(100)} in sales.</p><Wallet address={m.operator.address} /></div><div><Icon name="leaf" /><h3>Community · {percent(m.splits.communityBps)}</h3><p>{formatAmount(m.splits.communityBps / 100)} per {formatAmount(100)} in sales.{communityEnabled ? mode === "rewards" ? " Held in the protected rewards fund." : mode === "fundraise" ? " Held in the protected fundraising fund." : " Sent directly to the community account with each sale." : ""}</p>{communityEnabled ? <Wallet address={mode === "classic" ? m.communityFund?.address ?? null : (rewards ?? fundraise)?.bound ? (rewards ?? fundraise)!.contractId : null} /> : <p>No community contribution is enabled.</p>}</div></div></section>
    <section className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:grid-cols-3" aria-label="Recorded lifetime marketplace earnings"><div><p className="text-xs text-slate-500">All recorded sales</p><p className="mt-2 text-xl font-medium">{formatAmount(data.sales.grossUsd)}</p></div><div><p className="text-xs text-slate-500">Sellers received{data.sales.unclassifiedSales > 0 ? " (partial)" : ""}</p><p className="mt-2 text-xl font-medium">{formatAmount(data.sales.vendorUsd)}</p></div><div><p className="text-xs text-slate-500">Marketplace received{data.sales.unclassifiedSales > 0 ? " (partial)" : ""}</p><p className="mt-2 text-xl font-medium">{formatAmount(data.sales.operatorUsd)}</p></div></section>
    {communityEnabled && <section className="community-section"><p className="eyebrow">From contribution to recipient</p><h2>{mode === "rewards" ? "Who receives the community rewards?" : mode === "fundraise" ? "Where does the fundraising go?" : "Who manages the community fund?"}</h2>
      {mode === "rewards" && <><p className="section-copy mb-6 mt-3">Every period, the fund is shared between the people who sold and bought here: sellers by how much they sold, buyers by how much they bought. Periods follow one another by themselves. When one ends, each person claims their part; nobody can claim it for them.</p>
        {rewards?.bound ? <div className="space-y-4"><RewardsRules rewards={rewards} ledger={ledger} />{rewards.periods.map(period => <RewardsPeriodCard key={period.periodId} period={period} ledger={ledger} />)}<p className="text-xs text-slate-500">Showing up to {data.historyLimit} most recent periods with sales. Fund totals above include every period in the current contract.</p></div> : <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-500">We cannot verify the rewards periods right now. Try refreshing in a moment.</div>}
        <Link href="/rewards" className="button-secondary mt-6">Sold or bought here? See your rewards<Icon name="arrow" className="h-4 w-4" /></Link></>}
      {mode === "fundraise" && <><p className="section-copy mb-6 mt-3">The community share of every sale is saved in the contract until it reaches the target. Then it is paid to the wallets below at their fixed shares; anyone can check every payout on Stellar.</p>
        {fundraise?.bound ? <FundraiseProgress fundraise={fundraise} /> : <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-500">We cannot verify the fundraising right now. Try refreshing in a moment.</div>}</>}
      {mode === "classic" && <div className="community-period mt-5"><h3 className="text-lg font-medium">{m.communityFund?.name ?? "Community fund account"}</h3><Wallet address={m.communityFund?.address ?? null} /><p className="mt-4 text-sm leading-relaxed text-slate-600">The community share reaches this account with each completed purchase. Any further use or distribution is managed by the organizer; Compaki does not verify downstream beneficiaries or a payout date for this account.</p><p className="mt-3 text-xs leading-relaxed text-slate-500">The current account balance is not a record of total contributions or proof that a specific community project has received funds. See each purchase receipt for the payment split.</p></div>}
    </section>}
    <details className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 text-xs leading-relaxed text-slate-500"><summary className="cursor-pointer font-medium text-slate-700">About these numbers and payment accounts</summary><p className="mt-3">Purchase totals come from completed sale records, using the split saved when each purchase settled. Fund totals, rules, recipients and payouts are read from Stellar. Organizer descriptions and goals are explanatory text and do not change those rules. Compaki manages user payment accounts and signs transactions for them. This demo uses test funds with no monetary value.</p></details>
  </main>;
}
