import { localizedMessage } from "@/i18n/errors";
import { getTranslations } from "next-intl/server";
// "My rewards" — Community Rewards periods the session user sold or bought
// in, across marketplaces, with on-chain amounts and a claim button.

import { AppHeader, PageHeading, EmptyState } from "@/components/shell";
import { apiFetch } from "@/lib/api";

import { MemberRewards, type MemberRewardsPayload } from "./member-rewards";

export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const t = await getTranslations("ui");

  const res = await apiFetch("/api/rewards/me");

  if (res.status === 401) {
    return (
      <div className="min-h-screen bg-slate-50/60">
        <AppHeader />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-xl px-6 py-20 text-center">
          <EmptyState icon="leaf" title={t("goodThingsGrowTogether")} description={t("marketplacesWithCommunityRewardsSharePartOfEverySaleWithThe")} href="/login?next=/rewards" action={t("signInToSeeRewards")} />
        </main>
      </div>
    );
  }
  const body = (await res.json()) as MemberRewardsPayload & { error?: string };

  return (
    <div className="min-h-screen bg-slate-50/60">
      <AppHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-6 py-12">
        <PageHeading eyebrow={t("yourShareOfTheGood")} title={t("communityRewards3")} description={t("someMarketplacesSharePartOfEverySaleWithThePeopleWho")} />
        <div className="account-intro"><span>{t("01SalesGrowTheFund")}</span><span>→</span><span>{t("02ThePeriodEnds")}</span><span>→</span><span>{t("03CollectYourShare")}</span></div>
        {res.ok ? (
          <MemberRewards initial={body} />
        ) : (
          <p className="mt-8 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
            {localizedMessage(body.error, t, t("couldNotLoadRewardsValue", { value1: res.status }))}
          </p>
        )}
      </main>
    </div>
  );
}
