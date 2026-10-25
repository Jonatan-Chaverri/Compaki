import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { AppHeader, EmptyState } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { VendorDashboard, type ProductRow, type SaleRow, type SellerMarketplace } from "./[slug]/vendor-dashboard";

interface SellerPayload {
  vendorAccount: string | null;
  marketplaces: SellerMarketplace[];
  products: ProductRow[];
  sales: SaleRow[];
}
export async function SellerStudioPage({ marketplaceSlug }: { marketplaceSlug?: string }) {
  const t = await getTranslations("ui");
  const response = await apiFetch("/api/me/seller-dashboard");
  if (response.status === 401) return <><AppHeader /><main id="main-content" className="mx-auto max-w-xl px-6 py-16"><EmptyState title={t("yourSellerStudio")} description={t("sellerSignIn")} href={`/login?next=${encodeURIComponent(marketplaceSlug ? `/vendor/${marketplaceSlug}` : "/vendor")}`} action={t("signIn")} icon="store" /></main></>;
  if (response.status === 403) redirect("/sell");
  if (!response.ok) throw new Error(t("vendorDashboardRequestFailedValue", { value1: response.status }));
  const data = await response.json() as SellerPayload;
  if (marketplaceSlug && !data.marketplaces.some(marketplace => marketplace.slug === marketplaceSlug)) {
    notFound();
  }
  return <div className="min-h-screen bg-slate-50/60"><AppHeader /><VendorDashboard {...data} initialMarketplaceSlug={marketplaceSlug} /></div>;
}
