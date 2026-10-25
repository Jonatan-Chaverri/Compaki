"use client";
import { useLocale } from "next-intl";

import { useTranslations } from "next-intl";

import { CommunityEditor } from "@/components/community-editor";
import type { CommunityDetails } from "@/lib/community";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/shell";
import { useState } from "react";

import { LiveBalance } from "@/components/live-balance";
import { ProductVisual } from "@/components/shell";
import { formatDateTime, formatUsd } from "@/lib/format";
import type { CommunityMode } from "@/lib/rewards";

import { RewardsPanel } from "./rewards-panel";

export interface SaleFeedRow {
  id: string;
  productName: string;
  vendorName: string;
  buyerName: string;
  amountUsd: number;
  txHash: string;
  createdAt: string;
}

export interface VendorRow {
  id: string;
  name: string;
  email: string;
  sells: string;
  account: string | null;
  registerTxHash: string | null;
  joinedAt: string;
  productCount: number;
}

export interface CatalogRow {
  id: string;
  name: string;
  description: string;
  priceUsd: number;
  imageUrl: string | null;
  vendorName: string;
}

type Tab = "overview" | "rewards" | "vendors" | "products" | "community";

export function OperatorDashboard({
  community,
  initialTab = "overview",
  name,
  slug,
  regenerativeEnabled,
  communityMode,
  demoImpersonation,
  splits,
  operatorAccount,
  communityAccount,
  stats,
  sales,
  vendors,
  catalog,
}: {
  community: CommunityDetails;
  initialTab?: "overview" | "community";
  name: string;
  slug: string;
  regenerativeEnabled: boolean;
  communityMode: CommunityMode;
  demoImpersonation: boolean;
  splits: { vendorBps: number; operatorBps: number; communityBps: number };
  operatorAccount: string | null;
  communityAccount: string | null;
  stats: {
    totalSales: number;
    grossVolume: number;
    vendorRevenue: number;
    operatorRevenue: number;
    communityRevenue: number;
    platformRevenue: number;
  };
  sales: SaleFeedRow[];
  vendors: VendorRow[];
  catalog: CatalogRow[];
}) {
  const locale = useLocale();

  const t = useTranslations("ui");

  const [tab, setTab] = useState<Tab>(initialTab === "community" && splits.communityBps > 0 ? "community" : "overview");
  const tabs: Tab[] = communityMode !== "classic"
    ? ["overview", "rewards", "vendors", "products"]
    : ["overview", "vendors", "products"];
  if (splits.communityBps > 0) tabs.push("community");

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-6 py-8">
      <Link href="/dashboard" className="mb-4 inline-block text-sm text-slate-500 hover:text-slate-900">← {t("myMarketplaces")}</Link>
      <PageHeading eyebrow={t("yourMarketplaceAtAGlance")} title={name} description={t("aHomeForYourSellersYourSalesAndTheGoodYou")}>
        <Link href={`/m/${slug}`} className="button-secondary button-small">{t("viewStorefront")}<Icon name="arrow" className="h-4 w-4" /></Link>
      </PageHeading>
      <div className="dashboard-tabs" aria-label={t("marketplaceSections")}>
        {tabs.map(tabKey => <button key={tabKey} aria-pressed={tab === tabKey} onClick={() => setTab(tabKey)} className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium capitalize text-slate-500"><Icon name={tabKey === "overview" ? "grid" : (tabKey === "rewards" || tabKey === "community") ? "leaf" : tabKey === "vendors" ? "people" : "bag"} className="h-4 w-4" />{tabKey === "rewards" ? (communityMode === "fundraise" ? t("fundraising") : t("communityRewards")) : tabKey === "vendors" ? t("sellers") : tabKey === "community" ? t("communityStory") : (tabKey === "overview" ? t("overview") : t("products"))}</button>)}
      </div>
      {tab === "overview" && <div className="account-intro"><Icon name="leaf" className="h-5 w-5 shrink-0" /><span>{t("everySaleSupportsYourPeople")}{" "}<strong>{splits.vendorBps / 100}{t("toSellers")}</strong> · {splits.operatorBps / 100}{t("toYourMarketplace")}{" "}{splits.communityBps / 100}{t("toTheCommunity")}{regenerativeEnabled && t("communityContributionsAreEnabled")}</span></div>}

      {tab === "overview" && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-4">
            <StatCard label={t("totalSales")} value={String(stats.totalSales)} />
            <StatCard label={t("totalOrderValue")} value={formatUsd(stats.grossVolume, locale)} />
            {operatorAccount && (
              <LiveBalance account={operatorAccount} label={t("yourDemoBalance")} />
            )}
            {communityAccount && (
              <LiveBalance account={communityAccount} label={t("communityDemoBalance")} accent />
            )}
          </div>

          <div className="dashboard-summary">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              {t("goodSharedWithEverySale")}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <RevenueRow label={t("vendors")} amount={stats.vendorRevenue} dot="bg-navy-900" />
              <RevenueRow label={t("yourMarketplace")} amount={stats.operatorRevenue} dot="bg-slate-400" />
              <RevenueRow
                label={communityMode === "rewards" ? t("communityRewards") : communityMode === "fundraise" ? t("fundraising") : t("communityFund")}
                amount={stats.communityRevenue}
                dot="bg-emerald-500"
              />
              <RevenueRow label={t("compakiFee2")} amount={stats.platformRevenue ?? 0} dot="bg-brand-500" />
            </div>
          </div>

          <section className="mt-8">
            <h2 className="text-sm font-medium uppercase tracking-wider text-slate-400">
              {t("recentSales")}</h2>
            {sales.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                {t("noSalesYetShareYourStorefrontToGetGoing")}</div>
            ) : (
              <div className="scroll-table mt-3 rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                      <th className="px-4 py-3 font-medium">{t("product")}</th>
                      <th className="px-4 py-3 font-medium">{t("vendor")}</th>
                      <th className="px-4 py-3 font-medium">{t("when")}</th>
                      <th className="px-4 py-3 text-right font-medium">{t("amount")}</th>
                      <th className="px-4 py-3 text-right font-medium">{t("receipt")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((s) => (
                      <tr key={s.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-3 font-medium text-slate-900">{s.productName}</td>
                        <td className="px-4 py-3 text-slate-500">{s.vendorName}</td>
                        <td className="px-4 py-3 text-slate-500">{formatDateTime(s.createdAt, locale)}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                          {formatUsd(s.amountUsd, locale)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <a
                            href={`https://stellar.expert/explorer/testnet/tx/${s.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-slate-400 underline decoration-dotted underline-offset-2 hover:text-slate-700"
                          >
                            {t("viewPayment")}</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {tab === "rewards" && <RewardsPanel slug={slug} />}
      {tab === "community" && <CommunityEditor slug={slug} initial={community} mode={communityMode} />}

      {tab === "vendors" && (
        <section className="mt-6">
          <InviteLink slug={slug} />
          {vendors.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              {t("noVendorsYetShareTheInviteLinkAbove")}</div>
          ) : (
            <div className="mt-4 space-y-3">
              {vendors.map((v) => (
                <div
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {v.name}
                      <span className="ml-2 text-xs font-normal text-slate-400">{v.email}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {v.sells || "—"} · {t("productCount", { count: v.productCount })}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    {v.registerTxHash && (
                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${v.registerTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 underline decoration-dotted underline-offset-2 hover:text-slate-700"
                      >
                        {t("viewRegistration")}</a>
                    )}
                    {demoImpersonation && (
                      <a
                        href={`/api/demo/impersonate?userId=${v.id}&redirect=/vendor/${slug}`}
                        className="rounded-full border border-slate-200 px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50"
                        title={t("localDemoShortcutEnableDemoImpersonationSwitchesYourSessionToThis")}
                      >
                        {t("viewTheirDashboard")}</a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "products" && (
        <section className="mt-6">
          {catalog.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              {t("theCatalogIsEmptyVendorsAddProductsFromTheirOwnDashboards")}</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              {catalog.map((p) => (
                <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <ProductVisual imageUrl={p.imageUrl} />
                  <div className="mt-3 flex items-baseline justify-between gap-2">
                    <p className="font-medium text-slate-900">{p.name}</p>
                    <p className="text-sm font-semibold tabular-nums text-slate-900">
                      {formatUsd(p.priceUsd, locale)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{t("by")}{" "}{p.vendorName}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
        {value}
      </p>
    </div>
  );
}

function RevenueRow({ label, amount, dot }: { label: string; amount: number; dot: string }) {
  const locale = useLocale();

  return (
    <p className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
      <span className="flex items-center gap-2 text-slate-600">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </span>
      <span className="font-semibold tabular-nums text-slate-900">{formatUsd(amount, locale)}</span>
    </p>
  );
}

function InviteLink({ slug }: { slug: string }) {
  const t = useTranslations("ui");

  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const url = `/m/${slug}/join`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-medium text-slate-900">{t("inviteVendors")}</p>
        <p className="mt-0.5 text-sm text-slate-500">
          {t("anyoneWithThisLinkCanRegisterAndStartSellingInAbout")}</p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <code className="break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
          {url}
        </code>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(`${window.location.origin}/m/${slug}/join`);
              setCopied(true);
              setCopyError(false);
              setTimeout(() => setCopied(false), 1_500);
            } catch { setCopyError(true); }
          }}
          className="rounded-full bg-navy-900 px-4 py-2 text-xs font-medium text-white hover:bg-navy-700"
        >
          {copied ? t("copied") : copyError ? t("selectAndCopyLink") : t("copyInviteLink")}
        </button>
      </div>
    </div>
  );
}
