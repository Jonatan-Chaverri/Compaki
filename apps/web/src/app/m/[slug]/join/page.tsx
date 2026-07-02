import { notFound } from "next/navigation";

import { AppHeader } from "@/components/shell";
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

  return (
    <div className="min-h-screen bg-slate-50/60">
      <AppHeader right={<span className="text-sm text-slate-500">Become a vendor</span>} />
      <main className="mx-auto w-full max-w-xl px-6 py-12">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Sell on {marketplace.name}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {marketplace.description || "Join the marketplace and start selling."}{" "}
            You keep {marketplace.splitVendorBps / 100}% of every sale, paid out in seconds.
          </p>
        </div>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <JoinForm slug={marketplace.slug} marketplaceName={marketplace.name} />
        </div>
      </main>
    </div>
  );
}
