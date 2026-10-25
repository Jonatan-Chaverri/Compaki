"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";
import { AddToCartControls } from "@/components/cart";
import { Icon } from "@/components/icon";
import { ProductVisual } from "@/components/shell";
import { formatUsd } from "@/lib/format";
import { filterStorefrontProducts, parsePriceRange, storefrontVendors, type StorefrontProduct } from "@/lib/storefront-filters";
import styles from "./product-grid.module.css";

export type { StorefrontProduct } from "@/lib/storefront-filters";

export function ProductGrid({ slug, products }: { slug: string; products: StorefrontProduct[] }) {
  const locale = useLocale();
  const t = useTranslations("ui");
  const id = useId();
  const [query, setQuery] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [vendorIds, setVendorIds] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const vendors = useMemo(() => storefrontVendors(products, locale), [products, locale]);
  const filtered = useMemo(() => filterStorefrontProducts(products, { query, minPrice, maxPrice, vendorIds }), [products, query, minPrice, maxPrice, vendorIds]);
  const rangeError = parsePriceRange(minPrice, maxPrice).error;
  const activeCount = Number(query.trim() !== "") + Number(minPrice !== "" || maxPrice !== "") + vendorIds.length;
  const clearFilters = () => { setQuery(""); setMinPrice(""); setMaxPrice(""); setVendorIds([]); };
  const toggleVendor = (vendorId: string) => setVendorIds(selected => selected.includes(vendorId) ? selected.filter(value => value !== vendorId) : [...selected, vendorId]);
  const showResults = () => {
    setFiltersOpen(false);
    // Move focus after the panel has collapsed so the first result stays in view.
    requestAnimationFrame(() => {
      resultsHeading.current?.focus({ preventScroll: true });
      resultsHeading.current?.scrollIntoView({ block: "start" });
    });
  };

  return <section className={styles.catalog} aria-label={t("products")}>
    <button type="button" className={styles.mobileToggle} aria-controls={`${id}-filters`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>
      <Icon name="filter" className="h-4 w-4" /><span>{t("catalogFilters")}</span>{activeCount > 0 && <b>{activeCount}</b>}<Icon name="chevron" className="h-3 w-3" />
    </button>
    <div className={styles.layout}>
      <aside id={`${id}-filters`} className={styles.sidebar} data-open={filtersOpen} aria-labelledby={`${id}-filters-title`}>
        <div className={styles.sidebarHeading}><h2 id={`${id}-filters-title`}>{t("catalogFilters")}</h2>{activeCount > 0 && <button type="button" className={styles.clear} onClick={clearFilters}>{t("clearFilters")}</button>}</div>
        <label htmlFor={`${id}-search`} className={styles.searchLabel}>{t("catalogProductName")}</label>
        <div className={styles.search}><Icon name="search" /><input id={`${id}-search`} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("catalogSearchPlaceholder")} aria-controls={`${id}-results`} /></div>
        <fieldset className={styles.fieldset}>
          <legend>{t("catalogPriceRange")}</legend>
          <div className={styles.range}>
            <label><span>{t("catalogPriceFrom")}</span><input type="number" inputMode="decimal" min="0" step="0.01" value={minPrice} onChange={event => setMinPrice(event.target.value)} placeholder="0" aria-label={t("minimumPrice")} aria-invalid={Boolean(rangeError)} aria-describedby={rangeError ? `${id}-price-error` : undefined} /></label>
            <label><span>{t("catalogPriceTo")}</span><input type="number" inputMode="decimal" min="0" step="0.01" value={maxPrice} onChange={event => setMaxPrice(event.target.value)} placeholder={t("catalogNoPriceLimit")} aria-label={t("maximumPrice")} aria-invalid={Boolean(rangeError)} aria-describedby={rangeError ? `${id}-price-error` : undefined} /></label>
          </div>
          {rangeError && <p id={`${id}-price-error`} role="alert" className={styles.error}>{t(rangeError === "reversed" ? "catalogPriceReversed" : "catalogPriceInvalid")}</p>}
        </fieldset>
        <fieldset className={styles.fieldset}>
          <legend>{t("sellers")}</legend>
          <div className={styles.vendorList}>
            {vendors.map(vendor => <label key={vendor.id} className={styles.vendor}>
              <input type="checkbox" checked={vendorIds.includes(vendor.id)} onChange={() => toggleVendor(vendor.id)} aria-controls={`${id}-results`} />
              <span>{vendor.name}</span><small aria-label={t("productCount", { count: vendor.count })}>{vendor.count.toLocaleString(locale)}</small>
            </label>)}
          </div>
          <p className={styles.vendorHint}>{t(vendors.length ? "catalogSellerHint" : "catalogSellersEmpty")}</p>
        </fieldset>
        <button type="button" className={`button-primary button-small ${styles.mobileApply}`} onClick={showResults}>{t("catalogShowResults", { count: filtered.length })}<Icon name="arrow" className="h-4 w-4" /></button>
      </aside>

      <div className={styles.results} id={`${id}-results`}>
        <div className={styles.resultsHeading}>
          <h2 ref={resultsHeading} tabIndex={-1}>{t("findYourNextFavorite2")}</h2>
          <p role="status" aria-live="polite" aria-atomic="true">{t("productsFiltered", { shown: filtered.length, total: products.length })}</p>
        </div>
        {activeCount > 0 && <div className={styles.activeNote}><Icon name="filter" className="h-3.5 w-3.5" /><span>{t("catalogActiveFilters", { count: activeCount })}</span><button type="button" onClick={clearFilters}>{t("clearAllFilters")}</button></div>}
        {products.length === 0 ? <div className={styles.empty}>
          <span><Icon name="store" className="h-6 w-6" /></span><h3>{t("somethingGoodIsOnItsWay")}</h3>
          <p>{t("theSellersHereAreGettingTheirShelvesReadyComeBackSoon")}</p>
          <Link href="/marketplaces" className="button-secondary button-small mt-6">{t("exploreMarketplaces")}</Link>
        </div> : filtered.length === 0 ? <div className={styles.empty}>
          <span><Icon name="search" className="h-6 w-6" /></span><h3>{t(rangeError ? "catalogFixPriceTitle" : "letSFindSomethingYouLlLove")}</h3>
          <p>{t(rangeError ? "catalogFixPriceHint" : "catalogNoResults")}</p>
          <button type="button" className="button-secondary button-small" onClick={clearFilters}>{t("clearAllFilters")}</button>
        </div> : <div className={styles.cards}>
          {filtered.map(product => <article key={product.id} className={`${styles.product} product-card flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm`}>
            <Link href={`/m/${slug}/p/${product.id}`} className="group">
              <ProductVisual imageUrl={product.imageUrl} />
              <div className="mt-4">
                <div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-slate-900 group-hover:text-brand-700">{product.name}</h3><p className="whitespace-nowrap text-sm font-semibold text-slate-900">{formatUsd(product.priceUsd, locale)}</p></div>
                <p className="mt-0.5 text-xs text-slate-500">{t("by")} {product.vendorName}</p>
              </div>
            </Link>
            <div className="flex-1">{product.shortDescription && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600">{product.shortDescription}</p>}</div>
            <div className="mt-4"><AddToCartControls productId={product.id} stock={product.stock} /></div>
          </article>)}
        </div>}
      </div>
    </div>
  </section>;
}
