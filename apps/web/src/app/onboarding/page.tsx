import { redirect } from "next/navigation";

import { apiFetch } from "@/lib/api";

import { OnboardingWizard } from "./onboarding-wizard";

export const dynamic = "force-dynamic";

/** Creating a marketplace requires an account — gate before the wizard. */
export default async function OnboardingPage() {
  const res = await apiFetch("/api/me");
  const { user } = (await res.json()) as { user: { name: string } | null };
  if (!user) redirect("/login?next=/onboarding");

  return <OnboardingWizard operatorName={user.name} />;
}
