import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/icon";
import { AppHeader, PageHeading } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { MarketplaceDirectory, type DirectoryMarketplace } from "./marketplace-directory";

export const dynamic = "force-dynamic";

export default async function MarketplacesPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const t = await getTranslations("ui");

  const [res, params] = await Promise.all([apiFetch("/api/marketplaces/directory"), searchParams]);
  if (!res.ok) throw new Error(t("directoryRequestFailedValue", { value1: res.status }));
  const { marketplaces } = (await res.json()) as { marketplaces: DirectoryMarketplace[] };
  return <div className="min-h-screen bg-background"><AppHeader /><main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-12">
    <div className="directory-hero"><Icon name="leaf" /><PageHeading eyebrow={t("goodThingsAreCloserThanYouThink")} title={t("findYourPeopleShopTheirStories")} description={t("meetIndependentMakersAndGrowersDiscoverSomethingSpecialAndSupportThe")} /></div>
    <MarketplaceDirectory key={params.category ?? "all"} marketplaces={marketplaces} initialCategory={params.category} />
  </main></div>;
}
