import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { CommunityPayload } from "@/lib/community";
import { CommunityOverview } from "./community-overview";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getTranslations("ui");
  return { title: t("communityTitle"), description: t("communityDescription") };
}

export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getTranslations("ui");

  const { slug } = await params;
  const response = await apiFetch(`/api/marketplaces/${encodeURIComponent(slug)}/community`);
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error(t("communityInformationUnavailableValue", { value1: response.status }));
  const data = await response.json() as CommunityPayload;
  return <CommunityOverview initial={data} />;
}
