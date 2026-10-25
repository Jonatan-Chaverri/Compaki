"use client";
import { useLocale } from "next-intl";

import { useTranslations } from "next-intl";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AddToCartControls } from "@/components/cart";
import { Icon } from "@/components/icon";
import { EmptyState } from "@/components/shell";
import { ProductVisual } from "@/components/shell";
import { formatUsd } from "@/lib/format";

export interface StorefrontProduct {
  id: string;
  name: string;
  shortDescription: string;
  priceUsd: number;
  stock: number;
  imageUrl: string | null;
  vendorName: string;
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500";

/** Accent-insensitive: "cafe" matches "Café". */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function ProductGrid({
  slug,
  products,
}: {
  slug: string;
  products: StorefrontProduct[];
}) {
  const locale = useLocale();

  const t = useTranslations("ui");

  const [query, setQuery] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  const filtered = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    const min = minPrice === "" ? null : Number(minPrice);
    const max = maxPrice === "" ? null : Number(maxPrice);

    return products.filter((p) => {
      const haystack = normalize(t("valueValueValue", { value1: p.name, value2: p.vendorName, value3: p.shortDescription }));
      if (!terms.every((t) => haystack.includes(t))) return false;
      if (min !== null && !Number.isNaN(min) && p.priceUsd < min) return false;
      if (max !== null && !Number.isNaN(max) && p.priceUsd > max) return false;
      return true;
    });
  }, [products, query, minPrice, maxPrice, t]);

  const hasFilters = query.trim() !== "" || minPrice !== "" || maxPrice !== "";

  const clearFilters = () => {
    setQuery("");
    setMinPrice("");
    setMaxPrice("");
  };

  return (
    <div className="mt-9">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-medium tracking-tight">{t("findYourNextFavorite2")}</h2><span className="text-xs text-slate-500">{t("madeGrownOrChosenWithCare")}</span></div>
      <div className="catalog-toolbar flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
            <Icon name="search" className="h-4 w-4" />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchProductsVendors")}
            aria-label={t("searchProducts")}
            className={`${inputClass} pl-10`}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="mr-1 text-xs text-slate-500">{t("price")}</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder={t("min")}
            aria-label={t("minimumPrice")}
            className={`${inputClass} w-24`}
          />
          <span className="text-sm text-slate-400">–</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder={t("max")}
            aria-label={t("maximumPrice")}
            className={`${inputClass} w-24`}
          />
        </div>
      </div>

      {hasFilters && (
        <p role="status" className="mt-3 flex items-center gap-3 text-xs text-slate-500">
          <span>
            {t("productsFiltered", { shown: filtered.length, total: products.length })}
          </span>
          <button
            onClick={clearFilters}
            className="font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
          >
            {t("clearFilters")}</button>
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="mt-6"><EmptyState icon="search" title={t("letSFindSomethingYouLlLove")} description={t("noProductsMatchTheseFiltersTryADifferentSearchOrPrice")} /><button className="button-secondary mt-4" onClick={clearFilters}>{t("clearAllFilters")}</button></div>
      ) : (
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((product) => (
            <div
              key={product.id}
              className="product-card flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <Link href={`/m/${slug}/p/${product.id}`} className="group">
                <ProductVisual imageUrl={product.imageUrl} />
                <div className="mt-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold text-slate-900 group-hover:text-brand-700">
                      {product.name}
                    </h2>
                    <p className="whitespace-nowrap font-semibold text-slate-900">
                      {formatUsd(product.priceUsd, locale)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{t("by")}{" "}{product.vendorName}</p>
                </div>
              </Link>
              <div className="flex-1">
                {product.shortDescription && (
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600">
                    {product.shortDescription}
                  </p>
                )}
              </div>
              <div className="mt-4">
                <AddToCartControls productId={product.id} stock={product.stock} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
