import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/shell";
import { apiFetch } from "@/lib/api";

import { VendorDashboard, type ProductRow, type SaleRow } from "./vendor-dashboard";

export const dynamic = "force-dynamic";

type VendorDashboardPayload =
  | { member: false; marketplace: { name: string; slug: string } }
  | {
      member: true;
      marketplace: { name: string; slug: string; splitVendorBps: number };
      vendor: { name: string; account: string };
      products: ProductRow[];
      sales: SaleRow[];
    };

export default async function VendorPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const res = await apiFetch(
    `/api/marketplaces/${encodeURIComponent(slug)}/vendor-dashboard`,
  );
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`Vendor dashboard request failed (${res.status})`);
  const data = (await res.json()) as VendorDashboardPayload;

  if (!data.member) {
    return (
      <div className="min-h-screen bg-slate-50/60">
        <AppHeader />
        <main className="mx-auto w-full max-w-xl px-6 py-20 text-center">
          <h1 className="text-xl font-semibold text-slate-900">
            You&apos;re not a vendor here (yet)
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Register as a vendor of {data.marketplace.name} to manage products and see your
            sales.
          </p>
          <Link
            href={`/m/${slug}/join`}
            className="mt-6 inline-block rounded-full bg-navy-900 px-7 py-3 text-sm font-medium text-white hover:bg-navy-700"
          >
            Become a vendor
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/60">
      <AppHeader
        right={
          <span className="text-sm text-slate-500">
            {data.vendor.name} · vendor at{" "}
            <span className="font-medium text-slate-700">{data.marketplace.name}</span>
          </span>
        }
      />
      <VendorDashboard
        slug={data.marketplace.slug}
        marketplaceName={data.marketplace.name}
        vendorAccount={data.vendor.account}
        vendorBps={data.marketplace.splitVendorBps}
        products={data.products}
        sales={data.sales}
      />
    </div>
  );
}
