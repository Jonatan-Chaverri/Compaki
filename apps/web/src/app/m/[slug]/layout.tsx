// Shared chrome for every storefront page (/m/[slug]/**): the app header with
// the cart link, wrapped in the CartProvider that mirrors the cart cookie.

import Link from "next/link";

import { CartProvider, HeaderCartLink } from "@/components/cart";
import { AppHeader } from "@/components/shell";

export default async function MarketplaceLayout(props: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  return (
    <CartProvider slug={slug}>
      <div className="min-h-screen bg-slate-50/60">
        <AppHeader
          right={
            <>
              <Link
                href={`/m/${slug}/join`}
                className="text-sm text-slate-500 transition hover:text-slate-700"
              >
                Sell here →
              </Link>
              <HeaderCartLink />
            </>
          }
        />
        {props.children}
      </div>
    </CartProvider>
  );
}
