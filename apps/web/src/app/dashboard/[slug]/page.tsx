import type { CommunityDetails } from "@/lib/community";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/shell";
import { apiFetch } from "@/lib/api";

import {
  OperatorDashboard,
  type CatalogRow,
  type SaleFeedRow,
  type VendorRow,
} from "./operator-dashboard";

export const dynamic = "force-dynamic";

interface DashboardPayload {
  name: string;
  slug: string;
  regenerativeEnabled: boolean;
  rewardsEnabled: boolean;
  demoImpersonation: boolean;
  community: CommunityDetails;
  splits: { vendorBps: number; operatorBps: number; communityBps: number };
  operatorAccount: string | null;
  communityAccount: string | null;
  stats: {
    totalSales: number;
    grossVolume: number;
    vendorRevenue: number;
    operatorRevenue: number;
    communityRevenue: number;
    platformRevenue: number;
  };
  sales: SaleFeedRow[];
  vendors: VendorRow[];
  catalog: CatalogRow[];
}

export default async function OperatorPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ slug }, query] = await Promise.all([props.params, props.searchParams]);
  const res = await apiFetch(`/api/marketplaces/${encodeURIComponent(slug)}/dashboard`);
  if (res.status === 404) notFound();
  if (res.status === 401 || res.status === 403) {
    return (
      <div className="min-h-screen bg-slate-50/60">
        <AppHeader />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-xl px-6 py-20 text-center">
          <p className="text-3xl">🔐</p>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
            {res.status === 401
              ? "Sign in as the operator to see this dashboard"
              : "Only this marketplace's operator can see its dashboard"}
          </h1>
          <Link
            href={`/login?next=/dashboard/${encodeURIComponent(slug)}`}
            className="mt-6 inline-block rounded-full bg-navy-900 px-7 py-3 text-sm font-medium text-white transition hover:bg-navy-700"
          >
            {res.status === 401 ? "Sign in" : "Switch account"}
          </Link>
        </main>
      </div>
    );
  }
  if (!res.ok) throw new Error(`Dashboard request failed (${res.status})`);
  const data = (await res.json()) as DashboardPayload;

  return (
    <div className="min-h-screen bg-slate-50/60">
      <AppHeader />
      <OperatorDashboard
        community={data.community}
        initialTab={query.tab === "community" ? "community" : "overview"}
        name={data.name}
        slug={data.slug}
        regenerativeEnabled={data.regenerativeEnabled}
        rewardsEnabled={data.rewardsEnabled}
        demoImpersonation={data.demoImpersonation}
        splits={data.splits}
        operatorAccount={data.operatorAccount}
        communityAccount={data.communityAccount}
        stats={data.stats}
        sales={data.sales}
        vendors={data.vendors}
        catalog={data.catalog}
      />
    </div>
  );
}
