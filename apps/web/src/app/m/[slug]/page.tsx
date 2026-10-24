import { communityFundLabel } from "@/lib/format";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { MarketArt } from "@/components/market-art";
import { PageHeading, EmptyState } from "@/components/shell";
import { notFound } from "next/navigation";

import { apiFetch } from "@/lib/api";

import { ProductGrid, type StorefrontProduct } from "./product-grid";

interface StorefrontPayload {
  marketplace: {
    name: string;
    slug: string;
    description: string;
    category: string;
    regenerativeEnabled: boolean;
    splitCommunityBps: number;
    communityFundName: string | null;
    communityPurpose: string;
  };
  products: StorefrontProduct[];
}

export const dynamic = "force-dynamic";

export default async function StorefrontPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const res = await apiFetch(`/api/marketplaces/${encodeURIComponent(slug)}/storefront`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`Storefront request failed (${res.status})`);
  const { marketplace, products } = (await res.json()) as StorefrontPayload;

  const showRegenerativeBadge =
    marketplace.regenerativeEnabled && marketplace.splitCommunityBps > 0;

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-6 py-12">
      <Link href="/marketplaces" className="storefront-breadcrumb">← All marketplaces</Link>
      <section className="storefront-hero">
        <div>
          <PageHeading eyebrow={marketplace.category} title={marketplace.name} description={marketplace.description || "Thoughtful products. Independent people. A community worth discovering."} />
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-slate-500">{products.length} products · Shop from independent sellers</span>
            {showRegenerativeBadge && <span className="community-badge"><Icon name="leaf" className="h-3 w-3" />{marketplace.splitCommunityBps / 100}% of every sale supports {communityFundLabel(marketplace.communityFundName)}</span>}
          </div>
        </div>
        <MarketArt variant={/coffee|agri/i.test(marketplace.category) ? "coffee" : /craft/i.test(marketplace.category) ? "craft" : "grow"} />
      </section>

      {showRegenerativeBadge && <section className="community-teaser"><span className="community-teaser-icon"><Icon name="leaf" className="h-6 w-6" /></span><div><p className="eyebrow">Your purchase makes a difference</p><h2>{marketplace.splitCommunityBps / 100}% of every sale supports this community.</h2><p>{marketplace.communityPurpose || "Find out where contributions go, who receives them, and how this marketplace shares its impact."}</p></div><Link href={`/m/${marketplace.slug}/community`} className="button-secondary button-small">See the community benefits<Icon name="arrow" className="h-4 w-4" /></Link></section>}

      {products.length === 0 ? (
        <div className="mt-8"><EmptyState icon="store" title="Something good is on its way." description="The sellers here are getting their shelves ready. Come back soon, or explore another community in the meantime." href="/marketplaces" action="Explore marketplaces" /></div>
      ) : (
        <ProductGrid slug={marketplace.slug} products={products} />
      )}
    </main>
  );
}
