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
  splits: { vendorBps: number; operatorBps: number; communityBps: number };
  operatorAccount: string | null;
  communityAccount: string | null;
  stats: {
    totalSales: number;
    grossVolume: number;
    vendorRevenue: number;
    operatorRevenue: number;
    communityRevenue: number;
  };
  sales: SaleFeedRow[];
  vendors: VendorRow[];
  catalog: CatalogRow[];
}

export default async function OperatorPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const res = await apiFetch(`/api/marketplaces/${encodeURIComponent(slug)}/dashboard`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`Dashboard request failed (${res.status})`);
  const data = (await res.json()) as DashboardPayload;

  return (
    <div className="min-h-screen bg-slate-50/60">
      <AppHeader
        right={
          <span className="text-sm text-slate-500">
            Operator dashboard ·{" "}
            <span className="font-medium text-slate-700">{data.name}</span>
          </span>
        }
      />
      <OperatorDashboard
        name={data.name}
        slug={data.slug}
        regenerativeEnabled={data.regenerativeEnabled}
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
