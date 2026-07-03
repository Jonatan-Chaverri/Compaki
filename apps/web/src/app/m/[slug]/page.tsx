import { notFound } from "next/navigation";

import { apiFetch } from "@/lib/api";

import { ProductGrid, type StorefrontProduct } from "./product-grid";

interface StorefrontPayload {
  marketplace: {
    name: string;
    slug: string;
    description: string;
    category: string;
    regenerativeEnabled: boolean;
    splitCommunityBps: number;
    communityFundName: string | null;
  };
  products: StorefrontProduct[];
}

export const dynamic = "force-dynamic";

export default async function StorefrontPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const res = await apiFetch(`/api/marketplaces/${encodeURIComponent(slug)}/storefront`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`Storefront request failed (${res.status})`);
  const { marketplace, products } = (await res.json()) as StorefrontPayload;

  const showRegenerativeBadge =
    marketplace.regenerativeEnabled && marketplace.splitCommunityBps > 0;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          {marketplace.category}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          {marketplace.name}
        </h1>
        {marketplace.description && (
          <p className="mx-auto mt-3 max-w-xl text-slate-600">{marketplace.description}</p>
        )}
        {showRegenerativeBadge && (
          <p className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            ♻ {marketplace.splitCommunityBps / 100}% of every sale funds{" "}
            {marketplace.communityFundName ?? "the community fund"}
          </p>
        )}
      </div>

      {products.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center text-sm text-slate-500">
          No products yet — check back soon.
        </div>
      ) : (
        <ProductGrid slug={marketplace.slug} products={products} />
      )}
    </main>
  );
}
