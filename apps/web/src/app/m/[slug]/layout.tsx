// Shared chrome for every storefront page (/m/[slug]/**): the app header with
// the cart link, wrapped in the CartProvider that mirrors the cart cookie.

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
        <AppHeader right={<HeaderCartLink />} />
        {props.children}
      </div>
    </CartProvider>
  );
}
