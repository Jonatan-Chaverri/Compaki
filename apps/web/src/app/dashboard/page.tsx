import { redirect } from "next/navigation";

import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";

/** /dashboard → the session user's marketplace dashboard (or onboarding). */
export default async function DashboardIndex() {
  const res = await apiFetch("/api/me");
  const { operatedMarketplaceSlug } = (await res.json()) as {
    operatedMarketplaceSlug: string | null;
  };
  if (operatedMarketplaceSlug) redirect(`/dashboard/${operatedMarketplaceSlug}`);
  redirect("/onboarding");
}
