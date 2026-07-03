import { notFound } from "next/navigation";

import { apiFetch } from "@/lib/api";

import { CartView, type CartProduct } from "./cart-view";

interface StorefrontPayload {
  marketplace: { name: string; slug: string };
  products: CartProduct[];
}

export const dynamic = "force-dynamic";

export default async function CartPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const [res, meRes] = await Promise.all([
    apiFetch(`/api/marketplaces/${encodeURIComponent(slug)}/storefront`),
    apiFetch("/api/me"),
  ]);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`Storefront request failed (${res.status})`);
  const { marketplace, products } = (await res.json()) as StorefrontPayload;
  const { user } = (await meRes.json()) as { user: { id: string } | null };

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <CartView
        marketplaceName={marketplace.name}
        products={products}
        signedIn={user !== null}
      />
    </main>
  );
}
