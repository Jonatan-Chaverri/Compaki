import { categoryLabel } from "@/i18n/labels";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Icon } from "@/components/icon";
import styles from "./storefront-header.module.css";
import { EmptyState } from "@/components/shell";
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
  const t = await getTranslations("ui");

  const { slug } = await props.params;
  const res = await apiFetch(`/api/marketplaces/${encodeURIComponent(slug)}/storefront`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(t("storefrontRequestFailedValue", { value1: res.status }));
  const { marketplace, products } = (await res.json()) as StorefrontPayload;

  const hasCommunityContribution =
    marketplace.regenerativeEnabled && marketplace.splitCommunityBps > 0;

  return (
    <main id="main-content" tabIndex={-1} className={`mx-auto w-full max-w-6xl px-6 ${styles.page}`}>
      <Link href="/marketplaces" className="storefront-breadcrumb">{t("allMarketplaces")}</Link>
      <header className={styles.header} aria-labelledby="marketplace-title">
        <div className={styles.intro}>
          <div className={styles.meta}><p className="eyebrow">{categoryLabel(marketplace.category, t)}</p><p className={styles.products}><Icon name="bag" className="h-3.5 w-3.5" />{t("storefrontProductCount", { count: products.length })}</p></div>
          <h1 id="marketplace-title" className={styles.title}>{marketplace.name}</h1>
          <p className={styles.description}>{marketplace.description || t("thoughtfulProductsIndependentPeopleACommunityWorthDiscovering")}</p>
        </div>
        {hasCommunityContribution && <div className={styles.impact}>
          <span className={styles.impactIcon}><Icon name="leaf" className="h-5 w-5" /></span>
          <div className={styles.impactCopy}>
            <h2>{t("marketplaceCommunityImpact", { percent: marketplace.splitCommunityBps / 100 })}</h2>
          </div>
          <Link href={`/m/${marketplace.slug}/community`} className={`button-secondary button-small ${styles.benefits}`} aria-label={t("seeTheCommunityBenefits2")}>
            {t("viewCommunityBenefitsShort")}<Icon name="arrow" className="h-4 w-4" />
          </Link>
        </div>}
      </header>

      {products.length === 0 ? (
        <div className="mt-8"><EmptyState icon="store" title={t("somethingGoodIsOnItsWay")} description={t("theSellersHereAreGettingTheirShelvesReadyComeBackSoon")} href="/marketplaces" action={t("exploreMarketplaces")} /></div>
      ) : (
        <ProductGrid slug={marketplace.slug} products={products} />
      )}
    </main>
  );
}
