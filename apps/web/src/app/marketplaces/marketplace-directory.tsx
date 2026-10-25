"use client";
import { categoryLabel } from "@/i18n/labels";

import { useTranslations } from "next-intl";

import { communityFundLabel } from "@/lib/format";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { MarketArt } from "@/components/market-art";
import { EmptyState } from "@/components/shell";

export interface DirectoryMarketplace {
  name: string;
  slug: string;
  description: string;
  category: string;
  regenerativeEnabled: boolean;
  splitCommunityBps: number;
  communityFundName: string | null;
  productCount: number;
  vendorCount: number;
}

function normalize(value: string) { return value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

export function MarketplaceDirectory({ marketplaces, initialCategory = "All marketplaces" }: { marketplaces: DirectoryMarketplace[]; initialCategory?: string }) {
  const t = useTranslations("ui");

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const categories = ["All marketplaces", ...new Set([...marketplaces.map(m => m.category), ...(initialCategory !== "All marketplaces" ? [initialCategory] : [])])];
  const filtered = marketplaces.filter(m => (category === "All marketplaces" || m.category === category) && normalize(t("valueValueValue", { value1: m.name, value2: m.description, value3: `${m.category} ${categoryLabel(m.category, t)}` })).includes(normalize(query.trim())));
  return <>
    <div className="filter-bar"><div className="search-field"><Icon name="search" className="h-4 w-4" /><input aria-label={t("searchMarketplaces")} placeholder={t("findAMarketplaceCommunityOrSomethingYouLove")} type="search" value={query} onChange={e => setQuery(e.target.value)} /></div><Link href="/onboarding" className="button-secondary button-small"><Icon name="store" className="h-4 w-4" />{t("createAMarketplace")}</Link></div>
    <div className="filter-chips" aria-label={t("marketplaceCategories")}>{categories.map(c => <button key={c} onClick={() => setCategory(c)} className="filter-chip" aria-pressed={category === c}>{categoryLabel(c, t)}</button>)}</div>
    <p className="results-label" role="status">{t("marketplaceCount", { count: filtered.length })}{query && t("forValue", { value1: query })}</p>
    {filtered.length === 0 ? <><EmptyState icon="search" title={marketplaces.length ? t("aNewDiscoveryIsJustASearchAway") : t("everyCommunityStartsSomewhere")} description={marketplaces.length ? t("tryADifferentNameOrCategoryToFindYourPeople") : t("beTheFirstToBringYourMakersGrowersAndNeighborsTogether")} href={marketplaces.length ? undefined : "/onboarding"} action={t("startAMarketplace")} />{marketplaces.length > 0 && <button className="button-secondary mt-4" onClick={() => { setQuery(""); setCategory("All marketplaces"); }}>{t("clearSearchAndFilters")}</button>}</> : <div className="collection-grid">{filtered.map(m => <Link href={`/m/${m.slug}`} className="collection-card directory-card" key={m.slug}>
      <div className="collection-art"><MarketArt variant={/coffee|agri/i.test(m.category) ? "coffee" : /craft/i.test(m.category) ? "craft" : "grow"} /></div>
      <div className="directory-card-body"><p className="eyebrow">{categoryLabel(m.category, t)}</p><h2>{m.name}</h2><p className="line-clamp-2 min-h-11">{m.description || t("thoughtfulProductsFromThePeopleInThisCommunity")}</p><div className="directory-card-meta"><span>{t("productCount", { count: m.productCount })}</span><span>·</span><span>{t("sellerCount", { count: m.vendorCount })}</span></div>{m.regenerativeEnabled && m.splitCommunityBps > 0 && <span className="community-badge"><Icon name="leaf" className="h-3 w-3" />{m.splitCommunityBps / 100}{t("supports")}{" "}{communityFundLabel(m.communityFundName, t)}</span>}<div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4"><span className="text-xs font-medium">{t("meetTheMarketplace")}</span><span className="circle-arrow"><Icon name="arrow" className="h-4 w-4" /></span></div></div>
    </Link>)}</div>}
  </>;
}
