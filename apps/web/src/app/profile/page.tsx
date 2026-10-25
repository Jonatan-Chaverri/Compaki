import { getTranslations } from "next-intl/server";
// Personal details and everyday account actions, with payment references on demand.

import { AppHeader, EmptyState, PageHeading } from "@/components/shell";
import { apiFetch } from "@/lib/api";

import { ProfileView, type ProfileUser } from "./profile-view";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const t = await getTranslations("ui");

  const res = await apiFetch("/api/me");
  if (!res.ok) throw new Error(t("profileRequestFailedValue", { value1: res.status }));
  const { user } = (await res.json()) as { user: ProfileUser | null };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50/60">
        <AppHeader />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-xl px-6 py-20 text-center">
          <EmptyState
            icon="shield"
            title={t("makeYourselfAtHome")}
            description={t("signInToManageYourProfileCheckYourBalanceAndFind")}
            href="/login?next=/profile"
            action={t("signIn")}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/60">
      <AppHeader />
      <main id="main-content" tabIndex={-1} className="profile-page">
        <PageHeading
          eyebrow={t("yourCompaki")}
          title={t("myProfile")}
          description={t("aSpaceForYouYourPurchasesAndYourCommunity")}
        />
        <ProfileView user={user} />
      </main>
    </div>
  );
}
