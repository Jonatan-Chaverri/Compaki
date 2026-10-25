"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { CommunityEditor } from "@/components/community-editor";
import { DeleteMarketplace } from "@/components/delete-marketplace";
import { Icon, type IconName } from "@/components/icon";
import { LiveBalance } from "@/components/live-balance";
import { ProductVisual } from "@/components/shell";
import type { CommunityDetails } from "@/lib/community";
import { formatDateTime, formatUsd } from "@/lib/format";
import type { CommunityMode } from "@/lib/rewards";
import { RewardsPanel } from "./rewards-panel";
import styles from "./dashboard.module.css";

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

export interface OperatorDashboardProps {
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
}

export function OperatorDashboard({ community, initialTab = "overview", name, slug, communityMode,
  demoImpersonation, splits, operatorAccount, communityAccount, stats, sales, vendors, catalog }: OperatorDashboardProps) {
  const locale = useLocale();
  const t = useTranslations("ui");
  const hasCommunity = splits.communityBps > 0;
  const [tab, setTab] = useState<Tab>(initialTab === "community" && hasCommunity ? "community" : "overview");
  const [query, setQuery] = useState("");
  const [salesExpanded, setSalesExpanded] = useState(false);
  const normalize = (text: string) => text.toLocaleLowerCase(locale).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const filteredCatalog = catalog.filter(product => normalize(`${product.name} ${product.vendorName}`).includes(normalize(query.trim())));
  const tabs: { key: Tab; label: string; icon: IconName; count?: number }[] = [
    { key: "overview", label: t("overview"), icon: "grid" },
    { key: "vendors", label: t("sellers"), icon: "people", count: vendors.length },
    { key: "products", label: t("products"), icon: "bag", count: catalog.length },
    ...(communityMode !== "classic" ? [{ key: "rewards" as const, label: communityMode === "fundraise" ? t("fundraising") : t("communityRewards"), icon: "leaf" as const }] : []),
    ...(hasCommunity ? [{ key: "community" as const, label: t("communityStory"), icon: "heart" as const }] : []),
  ];
  const shares = [
    { label: t("sellers"), bps: splits.vendorBps, amount: stats.vendorRevenue, color: "var(--accent)" },
    { label: t("yourMarketplace"), bps: splits.operatorBps, amount: stats.operatorRevenue, color: "var(--warm-accent)" },
    ...(hasCommunity ? [{ label: t("community2"), bps: splits.communityBps, amount: stats.communityRevenue, color: "#91ad79" }] : []),
    { label: t("dashboardPlatform"), bps: Math.max(0, 10_000 - splits.vendorBps - splits.operatorBps - splits.communityBps), amount: stats.platformRevenue ?? 0, color: "var(--ink-soft)" },
  ];

  return <main id="main-content" tabIndex={-1} className={styles.dashboard}>
    <Link href="/dashboard" className={styles.breadcrumb}>← {t("myMarketplaces")}</Link>
    <header className={styles.header}>
      <div><p className="eyebrow">{t("dashboardEyebrow")}</p><h1>{name}</h1><p className={styles.intro}>{t("dashboardIntro")}</p></div>
      <div className={styles.headerActions}>
        <Link href={`/m/${slug}`} className="button-secondary button-small">{t("viewStorefront")}<Icon name="arrow" className="h-4 w-4" /></Link>
        <button type="button" className="button-primary button-small" onClick={() => setTab("vendors")}><Icon name="people" className="h-4 w-4" />{t("inviteVendors")}</button>
      </div>
    </header>
    <nav className={styles.tabs} aria-label={t("marketplaceSections")}>
      {tabs.map(item => <button key={item.key} type="button" aria-pressed={tab === item.key} onClick={() => setTab(item.key)}>
        <Icon name={item.icon} className="h-4 w-4" /><span>{item.label}</span>{item.count !== undefined && <span className={styles.tabCount}>{item.count.toLocaleString(locale)}</span>}
      </button>)}
    </nav>

    {tab === "overview" && <div className={styles.overview}>
      <section aria-labelledby="dashboard-summary-title">
        <div className={styles.sectionHeading}><h2 id="dashboard-summary-title">{t("dashboardOverview")}</h2><span className={styles.period}>{t("dashboardAllTime")}</span></div>
        <div className={styles.metrics}>
          <div className={styles.earnings}>
            <div className={styles.metricTop}><span>{t("dashboardRevenue")}</span><Icon name="store" className="h-5 w-5" /></div>
            <strong className={styles.earningsValue}>{formatUsd(stats.operatorRevenue, locale)}</strong>
            <p>{t("dashboardRevenueHint")}</p>
            <span className={styles.shareBadge}>{t("dashboardSaleShare", { percent: splits.operatorBps / 100 })}</span>
          </div>
          <MetricCard icon="bag" label={t("dashboardVolume")} value={formatUsd(stats.grossVolume, locale)} hint={t("dashboardVolumeHint")} />
          <MetricCard icon="check" label={t("totalSales")} value={stats.totalSales.toLocaleString(locale)} hint={t("dashboardSalesHint")} />
          <MetricCard icon={hasCommunity ? "leaf" : "store"} label={hasCommunity ? t("dashboardCommunity") : t("products")} value={hasCommunity ? formatUsd(stats.communityRevenue, locale) : catalog.length.toLocaleString(locale)} hint={hasCommunity ? t("dashboardCommunityHint") : t("dashboardProductsHint")} />
        </div>
      </section>

      <div className={styles.workspace}>
        <section className={styles.activity} aria-labelledby="dashboard-activity-title">
          <div className={styles.panelHeading}><div><h2 id="dashboard-activity-title">{t("dashboardActivity")}</h2><p>{t("dashboardActivityHint")}</p></div><span className={styles.panelIcon}><Icon name="bag" /></span></div>
          {sales.length === 0 ? <div className={styles.empty}>
            <span className={styles.emptyIcon}><Icon name="store" className="h-7 w-7" /></span><h3>{t("dashboardFirstSale")}</h3><p>{t("dashboardFirstSaleHint")}</p>
            <button type="button" className="button-secondary button-small" onClick={() => setTab("vendors")}>{t("inviteVendors")}<Icon name="arrow" className="h-4 w-4" /></button>
          </div> : <ul id="dashboard-recent-sales" className={styles.salesList}>{sales.slice(0, salesExpanded ? sales.length : 5).map(sale => <li key={sale.id}>
            <span className={styles.saleIcon}><Icon name="bag" className="h-4 w-4" /></span>
            <div className={styles.saleInfo}><strong>{sale.productName}</strong><p>{sale.vendorName}<span aria-hidden="true"> · </span><time dateTime={sale.createdAt}>{formatDateTime(sale.createdAt, locale)}</time></p></div>
            <strong className={styles.saleAmount}>{formatUsd(sale.amountUsd, locale)}</strong>
            <Link href={`/receipt/${sale.id}`} className={styles.receipt} aria-label={t("dashboardReceiptFor", { product: sale.productName })}><Icon name="arrow" className="h-4 w-4" /></Link>
          </li>)}</ul>}
          {sales.length > 5 && <button type="button" className={styles.moreSales} aria-expanded={salesExpanded} aria-controls="dashboard-recent-sales" onClick={() => setSalesExpanded(!salesExpanded)}>{salesExpanded ? t("dashboardFewerSales") : t("dashboardMoreSales", { count: sales.length })}</button>}
        </section>
        <aside className={styles.sidebar}>
          <InviteLink slug={slug} compact />
          {(operatorAccount || communityAccount) && <section className={styles.balances}>
            <h2>{t("dashboardBalances")}</h2>
            <div className={styles.balanceGrid}>
              {operatorAccount && <LiveBalance account={operatorAccount} label={t("dashboardOperatorBalance")} />}
              {communityAccount && <LiveBalance account={communityAccount} label={t("dashboardCommunityBalance")} accent />}
            </div>
            <p className={styles.balanceHint}>{t("dashboardBalancesHint")}</p>
          </section>}
        </aside>
      </div>

      <section className={styles.distribution} aria-labelledby="dashboard-distribution-title">
        <div className={styles.panelHeading}><div><h2 id="dashboard-distribution-title">{t("dashboardDistribution")}</h2><p>{t("dashboardDistributionHint")}</p></div>{hasCommunity && <Link href={`/m/${slug}/community`} className={styles.textAction}>{t("dashboardCommunityDetails")}<Icon name="arrow" className="h-4 w-4" /></Link>}</div>
        <div className={styles.splitBar} aria-hidden="true">{shares.filter(share => share.bps > 0).map(share => <span key={share.label} style={{width: `${share.bps / 100}%`, background: share.color}} />)}</div>
        <dl className={styles.shareList}>{shares.map(share => <div key={share.label}><dt><i style={{background: share.color}} />{share.label}<span>{(share.bps / 100).toLocaleString(locale)}%</span></dt><dd>{formatUsd(share.amount, locale)}</dd></div>)}</dl>
      </section>
    </div>}

    {tab === "rewards" && <div className={styles.detailPane}><RewardsPanel slug={slug} /></div>}
    {tab === "community" && <div className={styles.detailPane}><CommunityEditor slug={slug} initial={community} mode={communityMode} /></div>}

    {tab === "vendors" && <section className={styles.tabContent}>
      <div className={styles.sectionHeading}><div><h2>{t("dashboardSellerTitle")}</h2><p>{t("dashboardSellerCount", { count: vendors.length })}</p></div></div>
      <InviteLink slug={slug} />
      {vendors.length === 0 ? <div className={`${styles.empty} ${styles.emptyPanel}`}><span className={styles.emptyIcon}><Icon name="people" className="h-7 w-7" /></span><h3>{t("dashboardNoSellers")}</h3><p>{t("dashboardNoSellersHint")}</p></div>
        : <ul className={styles.vendors}>{vendors.map(vendor => <li key={vendor.id}>
          <div className={styles.vendorIdentity}><span className={styles.avatar}>{vendor.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</span><div><h3>{vendor.name}</h3><p>{vendor.email}</p>{vendor.sells && <p className={styles.vendorDescription}>{vendor.sells}</p>}</div></div>
          <div className={styles.vendorActions}><span className={styles.productCount}>{t("productCount", { count: vendor.productCount })}</span>
            {vendor.registerTxHash && <details className={styles.registration}><summary>{t("dashboardRegistration")}</summary><a href={`https://stellar.expert/explorer/testnet/tx/${vendor.registerTxHash}`} target="_blank" rel="noopener noreferrer">{t("viewRegistration")}</a></details>}
            {demoImpersonation && <a href={`/api/demo/impersonate?userId=${vendor.id}&redirect=/vendor/${slug}`} className={styles.textAction} title={t("localDemoShortcutEnableDemoImpersonationSwitchesYourSessionToThis")}>{t("viewTheirDashboard")}</a>}
          </div>
        </li>)}</ul>}
    </section>}

    {tab === "products" && <section className={styles.tabContent}>
      <div className={styles.sectionHeading}><div><h2>{t("dashboardCatalogTitle")}</h2><p>{t("dashboardCatalogCount", { count: catalog.length })}</p></div>
        {catalog.length > 0 && <div className={styles.search}><Icon name="search" className="h-4 w-4" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("dashboardSearchProducts")} aria-label={t("searchProducts")} /></div>}
      </div>
      {catalog.length === 0 ? <div className={`${styles.empty} ${styles.emptyPanel}`}><span className={styles.emptyIcon}><Icon name="bag" className="h-7 w-7" /></span><h3>{t("dashboardNoProducts")}</h3><p>{t("dashboardNoProductsHint")}</p><button type="button" className="button-secondary button-small" onClick={() => setTab("vendors")}>{t("dashboardManageSellers")}<Icon name="arrow" className="h-4 w-4" /></button></div>
        : filteredCatalog.length === 0 ? <div className={`${styles.empty} ${styles.emptyPanel}`}><Icon name="search" /><h3>{t("dashboardNoMatches")}</h3><button type="button" className="text-link" onClick={() => setQuery("")}>{t("dashboardClearSearch")}</button></div>
        : <div className={styles.catalog}>{filteredCatalog.map(product => <Link key={product.id} href={`/m/${slug}/p/${product.id}`} className={styles.productCard}>
          <ProductVisual imageUrl={product.imageUrl} /><div className={styles.productBody}><span className={styles.productSeller}>{product.vendorName}</span><h3>{product.name}</h3><p>{product.description}</p><div className={styles.productBottom}><strong>{formatUsd(product.priceUsd, locale)}</strong><span><Icon name="arrow" className="h-4 w-4" /></span></div></div>
        </Link>)}</div>}
    </section>}
    <DeleteMarketplace name={name} slug={slug} />
  </main>;
}

function MetricCard({ icon, label, value, hint }: { icon: IconName; label: string; value: string; hint: string }) {
  return <div className={styles.metric}><div className={styles.metricTop}><span>{label}</span><Icon name={icon} className="h-4 w-4" /></div><strong className={styles.metricValue}>{value}</strong><p>{hint}</p></div>;
}

function InviteLink({ slug, compact = false }: { slug: string; compact?: boolean }) {
  const t = useTranslations("ui");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const url = `/m/${slug}/join`;
  return <section className={`${styles.invite} ${compact ? styles.inviteCompact : ""}`}>
    <div className={styles.inviteCopy}><span className={styles.inviteIcon}><Icon name="people" /></span><div><h2>{compact ? t("dashboardGrow") : t("inviteVendors")}</h2><p>{t("dashboardGrowHint")}</p></div></div>
    <div className={styles.inviteActions}>{!compact && <code>{url}</code>}<button type="button" className={compact ? "button-primary button-small" : "button-secondary button-small"} onClick={async () => {
      try { await navigator.clipboard.writeText(`${window.location.origin}${url}`); setCopied(true); setCopyError(false); setTimeout(() => setCopied(false), 1_500); }
      catch { setCopyError(true); }
    }}>{copied ? t("copied") : t("dashboardCopyLink")}<Icon name="arrow" className="h-4 w-4" /></button></div>
    <span role="status" className={styles.copyStatus}>{copyError ? t("selectAndCopyLink") : copied ? t("copied") : ""}</span>
    {copyError && <code className={styles.copyFallback}>{url}</code>}
  </section>;
}
