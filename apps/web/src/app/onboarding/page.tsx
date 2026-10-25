import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { apiFetch } from "@/lib/api";

import { OnboardingWizard } from "./onboarding-wizard";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getTranslations("ui");
  return { title: t("onboardingTitle") };
}

/** Creating a marketplace requires an account — gate before the wizard. */
export default async function OnboardingPage() {
  const t = await getTranslations("ui");

  const res = await apiFetch("/api/me");
  if (!res.ok) throw new Error(t("couldNotLoadYourAccountValue", { value1: res.status }));
  const { user } = (await res.json()) as { user: { name: string } | null };
  if (!user) redirect("/login?next=/onboarding");

  return <OnboardingWizard operatorName={user.name} />;
}
