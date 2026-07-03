// Public directory of every marketplace on Compaki — anyone can browse and
// jump into a storefront.

import Link from "next/link";

import { AppHeader } from "@/components/shell";
import { apiFetch } from "@/lib/api";

interface DirectoryMarketplace {
  name: string;
  slug: string;
  description: string;
  category: string;
  regenerativeEnabled: boolean;
  splitCommunityBps: number;
  communityFundName: string | null;
  productCount: number;
  vendorCount: number;
}

export const dynamic = "force-dynamic";

export default async function MarketplacesPage() {
  const res = await apiFetch("/api/marketplaces/directory");
  if (!res.ok) throw new Error(`Directory request failed (${res.status})`);
  const { marketplaces } = (await res.json()) as { marketplaces: DirectoryMarketplace[] };

  return (
    <div className="min-h-screen bg-slate-50/60">
      <AppHeader
        right={
          <Link
            href="/onboarding"
            className="text-sm text-slate-500 transition hover:text-slate-700"
          >
            Create yours →
          </Link>
        }
      />
      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Explore marketplaces
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-slate-600">
            Every community selling on Compaki — browse freely, buy with one account.
          </p>
        </div>

        {marketplaces.length === 0 ? (
          <div className="mt-12 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center text-sm text-slate-500">
            No marketplaces yet —{" "}
            <Link href="/onboarding" className="font-medium text-slate-700 underline">
              launch the first one
            </Link>
            .
          </div>
        ) : (
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {marketplaces.map((m) => (
              <Link
                key={m.slug}
                href={`/m/${m.slug}`}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow-md"
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  {m.category}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900 group-hover:underline">
                  {m.name}
                </h2>
                {m.description && (
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600">
                    {m.description}
                  </p>
                )}
                <div className="mt-4 flex flex-1 flex-wrap items-end gap-x-4 gap-y-2 text-xs text-slate-500">
                  <span>
                    {m.productCount} product{m.productCount === 1 ? "" : "s"}
                  </span>
                  <span>
                    {m.vendorCount} vendor{m.vendorCount === 1 ? "" : "s"}
                  </span>
                  {m.regenerativeEnabled && m.splitCommunityBps > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                      ♻ {m.splitCommunityBps / 100}% to{" "}
                      {m.communityFundName ?? "the community fund"}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
