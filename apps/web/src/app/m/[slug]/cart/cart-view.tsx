"use client";

// The cart page: joins the cart cookie (via CartProvider) with the storefront
// catalog, lets the buyer adjust quantities or remove lines, and turns the
// cart into a PENDING order (10-minute validity) on "Proceed to payment".

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { AddToCartControls, useCart } from "@/components/cart";
import { ProductVisual } from "@/components/shell";
import { formatUsd } from "@/lib/format";

export interface CartProduct {
  id: string;
  name: string;
  priceUsd: number;
  stock: number;
  imageUrl: string | null;
  vendorName: string;
}

export function CartView({
  marketplaceName,
  products,
  signedIn,
}: {
  marketplaceName: string;
  products: CartProduct[];
  signedIn: boolean;
}) {
  const { slug, items, count, ready, drop, clear } = useCart();
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byId = new Map(products.map((p) => [p.id, p]));
  const lines = Object.entries(items)
    .map(([productId, quantity]) => {
      const product = byId.get(productId);
      return product ? { product, quantity } : null;
    })
    .filter((line): line is { product: CartProduct; quantity: number } => line !== null);
  const totalUsd = lines.reduce((acc, l) => acc + l.product.priceUsd * l.quantity, 0);

  const proceed = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketplaceSlug: slug,
          items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        }),
      });
      const data = (await res.json()) as { checkoutPath?: string; error?: string };
      if (!res.ok || !data.checkoutPath) {
        throw new Error(data.error ?? "Could not create your order");
      }
      clear();
      router.push(data.checkoutPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your order");
      setBusy(false);
    }
  };

  if (!ready) return null;

  if (lines.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
        <p className="text-3xl">🛒</p>
        <h1 className="mt-3 text-lg font-semibold tracking-tight text-slate-900">
          Your cart is empty
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Add products from {marketplaceName} and they&apos;ll show up here.
        </p>
        <Link
          href={`/m/${slug}`}
          className="mt-6 inline-block rounded-full bg-navy-900 px-7 py-2.5 text-sm font-medium text-white transition hover:bg-navy-700"
        >
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href={`/m/${slug}`}
        className="text-sm text-slate-500 transition hover:text-slate-700"
      >
        ← Continue shopping at {marketplaceName}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">Your cart</h1>
      <p className="mt-1 text-sm text-slate-500">
        {count} item{count === 1 ? "" : "s"} from {marketplaceName}
      </p>

      <ul className="mt-6 space-y-3">
        {lines.map(({ product, quantity }) => (
          <li
            key={product.id}
            className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="w-16 shrink-0">
              <ProductVisual imageUrl={product.imageUrl} size="sm" />
            </div>
            <div className="min-w-0 flex-1">
              <Link
                href={`/m/${slug}/p/${product.id}`}
                className="block truncate font-medium text-slate-900 hover:underline"
              >
                {product.name}
              </Link>
              <p className="text-xs text-slate-500">
                {formatUsd(product.priceUsd)} each · by {product.vendorName}
              </p>
              <button
                onClick={() => drop(product.id)}
                className="mt-1 text-xs text-slate-400 underline decoration-slate-300 underline-offset-2 transition hover:text-red-600"
              >
                Remove
              </button>
            </div>
            <div className="w-36 shrink-0">
              <AddToCartControls productId={product.id} stock={product.stock} />
            </div>
            <p className="w-20 shrink-0 text-right font-semibold tabular-nums text-slate-900">
              {formatUsd(product.priceUsd * quantity)}
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
        <span className="text-sm font-medium text-slate-600">Total</span>
        <span className="text-xl font-semibold tabular-nums text-slate-900">
          {formatUsd(totalUsd)}
        </span>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}

      {signedIn ? (
        <button
          onClick={() => void proceed()}
          disabled={busy}
          className="mt-6 w-full rounded-full bg-navy-900 px-6 py-3.5 text-base font-medium text-white transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Creating your order…
            </span>
          ) : (
            "Proceed to payment"
          )}
        </button>
      ) : (
        <Link
          href={`/login?next=${encodeURIComponent(pathname)}`}
          className="mt-6 block w-full rounded-full bg-navy-900 px-6 py-3.5 text-center text-base font-medium text-white transition hover:bg-navy-700"
        >
          Sign in to check out
        </Link>
      )}
      <p className="mt-3 text-center text-xs text-slate-400">
        Your order stays reserved for 10 minutes once you proceed to payment.
      </p>
    </div>
  );
}
