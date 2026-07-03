"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AddToCartControls } from "@/components/cart";
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
  const [query, setQuery] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  const filtered = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    const min = minPrice === "" ? null : Number(minPrice);
    const max = maxPrice === "" ? null : Number(maxPrice);

    return products.filter((p) => {
      const haystack = normalize(`${p.name} ${p.vendorName} ${p.shortDescription}`);
      if (!terms.every((t) => haystack.includes(t))) return false;
      if (min !== null && !Number.isNaN(min) && p.priceUsd < min) return false;
      if (max !== null && !Number.isNaN(max) && p.priceUsd > max) return false;
      return true;
    });
  }, [products, query, minPrice, maxPrice]);

  const hasFilters = query.trim() !== "" || minPrice !== "" || maxPrice !== "";

  const clearFilters = () => {
    setQuery("");
    setMinPrice("");
    setMaxPrice("");
  };

  return (
    <div className="mt-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
            🔍
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products, vendors…"
            aria-label="Search products"
            className={`${inputClass} pl-10`}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder="Min $"
            aria-label="Minimum price"
            className={`${inputClass} w-24`}
          />
          <span className="text-sm text-slate-400">–</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Max $"
            aria-label="Maximum price"
            className={`${inputClass} w-24`}
          />
        </div>
      </div>

      {hasFilters && (
        <p className="mt-3 flex items-center gap-3 text-xs text-slate-500">
          <span>
            {filtered.length} of {products.length} product{products.length === 1 ? "" : "s"}
          </span>
          <button
            onClick={clearFilters}
            className="font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
          >
            Clear filters
          </button>
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center text-sm text-slate-500">
          No products match your search.
        </div>
      ) : (
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((product) => (
            <div
              key={product.id}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <Link href={`/m/${slug}/p/${product.id}`} className="group">
                <ProductVisual imageUrl={product.imageUrl} />
                <div className="mt-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold text-slate-900 group-hover:underline">
                      {product.name}
                    </h2>
                    <p className="whitespace-nowrap font-semibold text-slate-900">
                      {formatUsd(product.priceUsd)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">by {product.vendorName}</p>
                </div>
              </Link>
              <div className="flex-1">
                {product.shortDescription && (
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
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
