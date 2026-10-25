import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
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
  if (!response.ok) throw new Error(t("vendorDashboardRequestFailedValue", { value1: response.status }));
  const data = await response.json() as SellerPayload;
  if (marketplaceSlug && !data.marketplaces.some(marketplace => marketplace.slug === marketplaceSlug)) {
    const info = await apiFetch(`/api/marketplaces/${encodeURIComponent(marketplaceSlug)}`);
    if (info.status === 404) notFound();
    if (!info.ok) throw new Error(t("marketplaceRequestFailedValue", { value1: info.status }));
    const { marketplace } = await info.json() as { marketplace: { name: string } };
    return <><AppHeader /><main id="main-content" className="mx-auto max-w-xl px-6 py-16 text-center"><h1 className="text-xl font-semibold">{t("youReNotAVendorHereYet")}</h1><p className="mt-3 text-sm text-slate-500">{t("registerAsAVendorOf")} {marketplace.name} {t("toManageProductsAndSeeYourSales")}</p><Link href={`/m/${marketplaceSlug}/join`} className="button-primary mt-6">{t("becomeAVendor")}</Link></main></>;
  }
  return <div className="min-h-screen bg-slate-50/60"><AppHeader /><VendorDashboard {...data} initialMarketplaceSlug={marketplaceSlug} /></div>;
}
