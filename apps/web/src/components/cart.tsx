"use client";

// Cart UI shared across every /m/[slug] page: a provider that mirrors the
// cart cookie into React state, a header link showing the item count, and the
// "Add to cart" / +/- stepper used on storefront cards and product pages.

import Link from "next/link";
import { createContext, useContext, useSyncExternalStore } from "react";

import {
  getCartSnapshot,
  getServerCartSnapshot,
  subscribeCart,
  writeCart,
  type CartMap,
} from "@/lib/cart";

interface CartContextValue {
  slug: string;
  items: CartMap;
  /** Total units across all products. */
  count: number;
  /** True once the cookie has been read (avoids SSR/client mismatch). */
  ready: boolean;
  add: (productId: string, maxStock?: number) => void;
  remove: (productId: string) => void;
  drop: (productId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside a CartProvider");
  return value;
}

/** True after hydration — the cart cookie is only readable on the client. */
function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function CartProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  const items = useSyncExternalStore(
    subscribeCart,
    () => getCartSnapshot(slug),
    getServerCartSnapshot,
  );
  const ready = useMounted();

  const mutate = (fn: (prev: CartMap) => CartMap) => {
    writeCart(slug, fn(getCartSnapshot(slug)));
  };

  const value: CartContextValue = {
    slug,
    items,
    count: Object.values(items).reduce((acc, quantity) => acc + quantity, 0),
    ready,
    add: (productId, maxStock) =>
      mutate((prev) => {
        const current = prev[productId] ?? 0;
        if (maxStock !== undefined && current >= maxStock) return prev;
        return { ...prev, [productId]: current + 1 };
      }),
    remove: (productId) =>
      mutate((prev) => {
        const current = prev[productId] ?? 0;
        const rest = { ...prev };
        if (current <= 1) {
          delete rest[productId];
          return rest;
        }
        rest[productId] = current - 1;
        return rest;
      }),
    drop: (productId) =>
      mutate((prev) => {
        const rest = { ...prev };
        delete rest[productId];
        return rest;
      }),
    clear: () => mutate(() => ({})),
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/** Header cart link with a live item-count badge. */
export function HeaderCartLink() {
  const { slug, count, ready } = useCart();
  return (
    <Link
      href={`/m/${slug}/cart`}
      aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}
      className="relative flex flex-col items-center gap-1 rounded-lg px-2 py-1 transition hover:bg-slate-50"
    >
      <span className="relative flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <circle cx="9" cy="20" r="1.5" />
          <circle cx="17" cy="20" r="1.5" />
          <path d="M3 4h2l2.5 12h10L21 8H6" />
        </svg>
        {ready && count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-navy-900 px-1 text-[10px] font-semibold leading-none text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </span>
      <span className="text-[11px] font-medium leading-none text-slate-600">Cart</span>
    </Link>
  );
}

/**
 * "Add to cart" button that turns into a − qty + stepper once at least one
 * unit is in the cart. `stock` caps the + button; zero stock disables adding.
 */
export function AddToCartControls({
  productId,
  stock,
  size = "md",
}: {
  productId: string;
  stock: number;
  size?: "md" | "lg";
}) {
  const { items, add, remove } = useCart();
  const quantity = items[productId] ?? 0;
  const heightClass = size === "lg" ? "h-12 text-base" : "h-10 text-sm";

  if (quantity === 0) {
    return (
      <button
        onClick={() => add(productId, stock)}
        disabled={stock <= 0}
        className={`${heightClass} w-full rounded-full bg-navy-900 px-5 font-medium text-white transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400`}
      >
        {stock <= 0 ? "Out of stock" : "Add to cart"}
      </button>
    );
  }

  const stepperButton =
    "flex h-full w-12 items-center justify-center text-lg font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300";

  return (
    <div
      className={`${heightClass} flex w-full items-stretch overflow-hidden rounded-full border border-slate-200 bg-white`}
    >
      <button
        onClick={() => remove(productId)}
        aria-label="Remove one unit"
        className={stepperButton}
      >
        −
      </button>
      <span className="flex flex-1 items-center justify-center font-semibold tabular-nums text-slate-900">
        {quantity} in cart
      </span>
      <button
        onClick={() => add(productId, stock)}
        disabled={quantity >= stock}
        aria-label="Add one unit"
        className={stepperButton}
      >
        +
      </button>
    </div>
  );
}
