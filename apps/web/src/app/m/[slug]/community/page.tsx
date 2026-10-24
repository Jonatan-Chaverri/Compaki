import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { CommunityPayload } from "@/lib/community";
import { CommunityOverview } from "./community-overview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Community benefits & transparency — Compaki", description: "See what this marketplace supports, how sales are shared, and the community fund’s contributions, recipients and payment status." };

export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const response = await apiFetch(`/api/marketplaces/${encodeURIComponent(slug)}/community`);
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error(`Community information unavailable (${response.status})`);
  const data = await response.json() as CommunityPayload;
  return <CommunityOverview initial={data} />;
}
