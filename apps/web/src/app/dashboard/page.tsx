import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { Icon } from "@/components/icon";
import { AppHeader, EmptyState, PageHeading } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { formatUsd } from "@/lib/format";
import type { CommunityMode } from "@/lib/rewards";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getTranslations("ui");
  return { title: t("myMarketplaces") };
}

interface OperatedMarketplace {
  name: string;
  slug: string;
  category: string;
  communityMode: CommunityMode;
  communityBps: number;
  createdAt: string;
  revenueUsd: number;
  salesCount: number;
  availableProducts: number;
}

/** /dashboard — "My marketplaces": every marketplace the session user operates. */
export default async function MyMarketplacesPage() {
  const t = await getTranslations("ui");
  const locale = await getLocale();

  const res = await apiFetch("/api/me/marketplaces");
  if (res.status === 401) {
    return (
      <div className="min-h-screen bg-slate-50/60">
        <AppHeader />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-xl px-6 py-20 text-center">
          <EmptyState icon="store" title={t("myMarketplaces")} description={t("signInToSeeTheMarketplacesYouCreated")} href="/login?next=/dashboard" action={t("signIn")} />
        </main>
      </div>
    );
  }
  if (!res.ok) throw new Error(t("marketplacesRequestFailedValue", { value1: res.status }));
  const { marketplaces } = (await res.json()) as { marketplaces: OperatedMarketplace[] };

  const typeLabel = (m: OperatedMarketplace) =>
    m.communityMode === "rewards"
      ? t("marketplaceTypeRewards")
      : m.communityMode === "fundraise"
        ? t("marketplaceTypeFundraise")
        : m.communityBps > 0
          ? t("marketplaceTypeCommunityFund")
          : t("marketplaceTypeStandard");
  const createdOn = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="min-h-screen bg-slate-50/60">
      <AppHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
        <PageHeading eyebrow={t("yourCompaki")} title={t("myMarketplaces")} description={t("everyMarketplaceYouCreatedWithItsSalesAndCatalog")}>
          {marketplaces.length > 0 && (
            <Link href="/onboarding" className="button-primary button-small">
              {t("createMarketplace")}
              <Icon name="arrow" className="h-3.5 w-3.5" />
            </Link>
          )}
        </PageHeading>

        {marketplaces.length === 0 ? (
          <EmptyState icon="store" title={t("everyCommunityStartsSomewhere")} description={t("youHaveNotCreatedAMarketplaceYet")} href="/onboarding" action={t("createMarketplace")} />
        ) : (
          <ul className="space-y-3">
            {marketplaces.map((m) => (
              <li key={m.slug} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-slate-900">
                      <Link href={`/dashboard/${m.slug}`} className="hover:underline">{m.name}</Link>
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">/m/{m.slug}</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    {typeLabel(m)}
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-slate-500">{t("revenue")}</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{formatUsd(m.revenueUsd, locale)}</dd>
                    <dd className="text-xs text-slate-500">{t("salesCount", { count: m.salesCount })}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">{t("availableProducts")}</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{m.availableProducts}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">{t("createdOn")}</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">{createdOn(m.createdAt)}</dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/dashboard/${m.slug}`} className="button-primary button-small">
                    {t("manage")}
                    <Icon name="arrow" className="h-3.5 w-3.5" />
                  </Link>
                  <Link href={`/m/${m.slug}`} className="button-secondary button-small">{t("viewStorefront")}</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
