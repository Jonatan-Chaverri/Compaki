"use client";

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
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const categories = ["All marketplaces", ...new Set([...marketplaces.map(m => m.category), ...(initialCategory !== "All marketplaces" ? [initialCategory] : [])])];
  const filtered = marketplaces.filter(m => (category === "All marketplaces" || m.category === category) && normalize(`${m.name} ${m.description} ${m.category}`).includes(normalize(query.trim())));
  return <>
    <div className="filter-bar"><div className="search-field"><Icon name="search" className="h-4 w-4" /><input aria-label="Search marketplaces" placeholder="Find a marketplace, community or something you love…" type="search" value={query} onChange={e => setQuery(e.target.value)} /></div><Link href="/onboarding" className="button-secondary button-small"><Icon name="store" className="h-4 w-4" />Create a marketplace</Link></div>
    <div className="filter-chips" aria-label="Marketplace categories">{categories.map(c => <button key={c} onClick={() => setCategory(c)} className="filter-chip" aria-pressed={category === c}>{c}</button>)}</div>
    <p className="results-label" role="status">{filtered.length} marketplace{filtered.length === 1 ? "" : "s"} to discover{query && ` for “${query}”`}</p>
    {filtered.length === 0 ? <><EmptyState icon="search" title={marketplaces.length ? "A new discovery is just a search away." : "Every community starts somewhere."} description={marketplaces.length ? "Try a different name or category to find your people." : "Be the first to bring your makers, growers and neighbors together."} href={marketplaces.length ? undefined : "/onboarding"} action="Start a marketplace" />{marketplaces.length > 0 && <button className="button-secondary mt-4" onClick={() => { setQuery(""); setCategory("All marketplaces"); }}>Clear search and filters</button>}</> : <div className="collection-grid">{filtered.map(m => <Link href={`/m/${m.slug}`} className="collection-card directory-card" key={m.slug}>
      <div className="collection-art"><MarketArt variant={/coffee|agri/i.test(m.category) ? "coffee" : /craft/i.test(m.category) ? "craft" : "grow"} /></div>
      <div className="directory-card-body"><p className="eyebrow">{m.category}</p><h2>{m.name}</h2><p className="line-clamp-2 min-h-11">{m.description || "Thoughtful products from the people in this community."}</p><div className="directory-card-meta"><span>{m.productCount} product{m.productCount === 1 ? "" : "s"}</span><span>·</span><span>{m.vendorCount} independent seller{m.vendorCount === 1 ? "" : "s"}</span></div>{m.regenerativeEnabled && m.splitCommunityBps > 0 && <span className="community-badge"><Icon name="leaf" className="h-3 w-3" />{m.splitCommunityBps / 100}% supports {communityFundLabel(m.communityFundName)}</span>}<div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4"><span className="text-xs font-medium">Meet the marketplace</span><span className="circle-arrow"><Icon name="arrow" className="h-4 w-4" /></span></div></div>
    </Link>)}</div>}
  </>;
}
