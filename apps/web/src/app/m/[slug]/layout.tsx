import { getTranslations } from "next-intl/server";
// Shared chrome for every storefront page (/m/[slug]/**): the app header with
// the cart link, wrapped in the CartProvider that mirrors the cart cookie.

import Link from "next/link";

import { CartProvider, HeaderCartLink } from "@/components/cart";
import { apiFetch } from "@/lib/api";
import { AppHeader } from "@/components/shell";

export default async function MarketplaceLayout(props: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const t = await getTranslations("ui");
  const { slug } = await props.params;
  let signedIn = false;
  try {
    const response = await apiFetch("/api/me");
    if (response.ok) {
      const { user } = await response.json() as { user: { id: string } | null };
      signedIn = typeof user?.id === "string";
    }
  } catch {
    // An unavailable session service must not expose account-only navigation.
  }
  return (
    <CartProvider slug={slug}>
      <div className="min-h-screen bg-slate-50/60">
        <AppHeader
          right={
            <>
              {signedIn && <Link
                href={`/m/${slug}/join`}
                className="text-xs font-medium text-slate-500 transition hover:text-slate-700"
              >
                {t("becomeASeller")}
              </Link>}
              <HeaderCartLink />
            </>
          }
        />
        {props.children}
      </div>
    </CartProvider>
  );
}
