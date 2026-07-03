import Link from "next/link";
import { notFound } from "next/navigation";

import { AddToCartControls } from "@/components/cart";
import { ProductVisual } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { formatUsd } from "@/lib/format";

interface ProductPayload {
  product: {
    id: string;
    name: string;
    shortDescription: string;
    description: string;
    priceUsd: number;
    stock: number;
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

export default async function ProductPage(props: {
  params: Promise<{ slug: string; productId: string }>;
}) {
  const { slug, productId } = await props.params;
  const res = await apiFetch(`/api/products/${encodeURIComponent(productId)}`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`Product request failed (${res.status})`);
  const { product, marketplace } = (await res.json()) as ProductPayload;
  if (marketplace.slug !== slug) notFound();

  const inStock = product.stock > 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link
        href={`/m/${marketplace.slug}`}
        className="text-sm text-slate-500 transition hover:text-slate-700"
      >
        ← Back to {marketplace.name}
      </Link>

      <div className="mt-4 grid gap-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:grid-cols-2">
        <div>
          <ProductVisual imageUrl={product.imageUrl} />
        </div>
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {product.name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">by {product.vendorName}</p>
          <p className="mt-4 text-2xl font-semibold text-slate-900">
            {formatUsd(product.priceUsd)}
          </p>
          <p className={`mt-2 text-sm font-medium ${inStock ? "text-emerald-600" : "text-red-600"}`}>
            {inStock
              ? `${product.stock} unit${product.stock === 1 ? "" : "s"} in stock`
              : "Out of stock"}
          </p>
          <div className="mt-6">
            <AddToCartControls productId={product.id} stock={product.stock} size="lg" />
          </div>
          <Link
            href={`/m/${marketplace.slug}/cart`}
            className="mt-3 text-center text-sm text-slate-500 underline decoration-slate-300 underline-offset-2 transition hover:text-slate-700"
          >
            View cart
          </Link>
        </div>
      </div>

      {product.description && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-sm font-medium uppercase tracking-wider text-slate-400">
            About this product
          </h2>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-slate-700">
            {product.description}
          </p>
        </div>
      )}

      {marketplace.regenerativeEnabled && marketplace.splitCommunityBps > 0 && (
        <p className="mt-4 text-center text-xs text-emerald-700">
          ♻ {marketplace.splitCommunityBps / 100}% of this purchase funds{" "}
          {marketplace.communityFundName ?? "the community fund"}
        </p>
      )}
    </main>
  );
}
