import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader, ProductVisual } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { formatUsd } from "@/lib/format";

import { CheckoutForm } from "./checkout-form";

interface CheckoutPayload {
  product: {
    id: string;
    name: string;
    description: string;
    priceUsd: number;
    imageUrl: string | null;
    vendorName: string;
  };
  marketplace: {
    name: string;
    slug: string;
    regenerativeEnabled: boolean;
    splitCommunityBps: number;
    communityFundName: string | null;
  };
}

export const dynamic = "force-dynamic";

export default async function BuyPage(props: {
  params: Promise<{ slug: string; productId: string }>;
}) {
  const { slug, productId } = await props.params;
  const [res, meRes] = await Promise.all([
    apiFetch(`/api/products/${encodeURIComponent(productId)}`),
    apiFetch("/api/me"),
  ]);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`Checkout request failed (${res.status})`);
  const { product, marketplace } = (await res.json()) as CheckoutPayload;
  if (marketplace.slug !== slug) notFound();
  const { user } = (await meRes.json()) as {
    user: { name: string; email: string | null; country: string | null } | null;
  };

  return (
    <div className="min-h-screen bg-slate-50/60">
      <AppHeader
        right={<span className="text-sm text-slate-500">Checkout · {marketplace.name}</span>}
      />
      <main className="mx-auto w-full max-w-xl px-6 py-12">
        <Link
          href={`/m/${marketplace.slug}`}
          className="text-sm text-slate-500 transition hover:text-slate-700"
        >
          ← Back to {marketplace.name}
        </Link>

        {/* Order summary */}
        <div className="mt-4 flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="w-24 shrink-0">
            <ProductVisual imageUrl={product.imageUrl} />
          </div>
          <div className="flex-1">
            <h1 className="font-semibold text-slate-900">{product.name}</h1>
            <p className="text-xs text-slate-500">by {product.vendorName}</p>
          </div>
          <p className="text-lg font-semibold text-slate-900">{formatUsd(product.priceUsd)}</p>
        </div>

        {marketplace.regenerativeEnabled && marketplace.splitCommunityBps > 0 && (
          <p className="mt-3 text-center text-xs text-emerald-700">
            ♻ {marketplace.splitCommunityBps / 100}% of this purchase funds{" "}
            {marketplace.communityFundName ?? "the community fund"}
          </p>
        )}

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <CheckoutForm
            productId={product.id}
            productName={product.name}
            priceUsd={product.priceUsd}
            marketplaceSlug={marketplace.slug}
            marketplaceName={marketplace.name}
            user={user}
          />
        </div>
      </main>
    </div>
  );
}
