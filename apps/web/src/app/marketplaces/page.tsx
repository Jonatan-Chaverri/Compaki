import { Icon } from "@/components/icon";
import { AppHeader, PageHeading } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { MarketplaceDirectory, type DirectoryMarketplace } from "./marketplace-directory";

export const dynamic = "force-dynamic";

export default async function MarketplacesPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const [res, params] = await Promise.all([apiFetch("/api/marketplaces/directory"), searchParams]);
  if (!res.ok) throw new Error(`Directory request failed (${res.status})`);
  const { marketplaces } = (await res.json()) as { marketplaces: DirectoryMarketplace[] };
  return <div className="min-h-screen bg-background"><AppHeader /><main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-12">
    <div className="directory-hero"><Icon name="leaf" /><PageHeading eyebrow="Good things are closer than you think" title="Find your people. Shop their stories." description="Meet independent makers and growers, discover something special, and support the communities behind it all." /></div>
    <MarketplaceDirectory key={params.category ?? "all"} marketplaces={marketplaces} initialCategory={params.category} />
  </main></div>;
}
