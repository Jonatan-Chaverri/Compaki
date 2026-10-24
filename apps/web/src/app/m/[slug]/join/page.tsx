import Link from "next/link";
import { PageHeading } from "@/components/shell";
import { Icon } from "@/components/icon";
import { notFound } from "next/navigation";

import { apiFetch } from "@/lib/api";

import { JoinForm } from "./join-form";

interface MarketplaceInfo {
  name: string;
  slug: string;
  description: string;
  splitVendorBps: number;
}

export default async function JoinPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const res = await apiFetch(`/api/marketplaces/${encodeURIComponent(slug)}`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`Marketplace request failed (${res.status})`);
  const { marketplace } = (await res.json()) as { marketplace: MarketplaceInfo };
  // Vendors join as the signed-in user (never by typing someone's email).
  const meRes = await apiFetch("/api/me");
  const { user } = (await meRes.json()) as { user: { name: string; email: string | null } | null };

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-xl px-6 py-12">
      <PageHeading eyebrow="There’s a place for what you make" title={`Sell with ${marketplace.name}`} description={marketplace.description || "Connect your products with people who care about where they come from."} />
      <div className="account-intro"><Icon name="store" className="h-6 w-6 shrink-0" /><span>You keep <strong>{marketplace.splitVendorBps / 100}% of every sale</strong>. Add your products, share your story, and manage everything from your seller studio.</span></div>
      <Link href={`/m/${marketplace.slug}/community`} className="text-link">See how sales are shared and who benefits<Icon name="arrow" className="h-4 w-4" /></Link>
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <JoinForm slug={marketplace.slug} marketplaceName={marketplace.name} user={user} />
      </div>
    </main>
  );
}
