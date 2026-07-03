"use client";

import { useState } from "react";

import { LiveBalance } from "@/components/live-balance";
import { ProductVisual } from "@/components/shell";
import { formatDateTime, formatUsd } from "@/lib/format";

export interface SaleFeedRow {
  id: string;
  productName: string;
  vendorName: string;
  buyerName: string;
  amountUsd: number;
  txHash: string;
  createdAt: string;
}

export interface VendorRow {
  id: string;
  name: string;
  email: string;
  sells: string;
  account: string | null;
  registerTxHash: string | null;
  joinedAt: string;
  productCount: number;
}

export interface CatalogRow {
  id: string;
  name: string;
  description: string;
  priceUsd: number;
  imageUrl: string | null;
  vendorName: string;
}

type Tab = "overview" | "vendors" | "products";

export function OperatorDashboard({
  name,
  slug,
  regenerativeEnabled,
  splits,
  operatorAccount,
  communityAccount,
  stats,
  sales,
  vendors,
  catalog,
}: {
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
}) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Splits {splits.vendorBps / 100}% vendors · {splits.operatorBps / 100}% you ·{" "}
            {splits.communityBps / 100}% community
            {regenerativeEnabled && (
              <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                regenerative
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {(["overview", "vendors", "products"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition ${
                tab === t ? "bg-navy-900 text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-4">
            <StatCard label="Total sales" value={String(stats.totalSales)} />
            <StatCard label="Gross volume" value={formatUsd(stats.grossVolume)} />
            {operatorAccount && (
              <LiveBalance account={operatorAccount} label="Your balance (live)" />
            )}
            {communityAccount && (
              <LiveBalance account={communityAccount} label="Community fund (live)" accent />
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Revenue by recipient
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <RevenueRow label="Vendors" amount={stats.vendorRevenue} dot="bg-navy-900" />
              <RevenueRow label="You (operator)" amount={stats.operatorRevenue} dot="bg-slate-400" />
              <RevenueRow label="Community fund" amount={stats.communityRevenue} dot="bg-emerald-500" />
            </div>
          </div>

          <section className="mt-8">
            <h2 className="text-sm font-medium uppercase tracking-wider text-slate-400">
              Recent sales
            </h2>
            {sales.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                No sales yet — share your storefront to get going.
              </div>
            ) : (
              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                      <th className="px-4 py-3 font-medium">Product</th>
                      <th className="px-4 py-3 font-medium">Vendor</th>
                      <th className="px-4 py-3 font-medium">When</th>
                      <th className="px-4 py-3 text-right font-medium">Amount</th>
                      <th className="px-4 py-3 text-right font-medium">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((s) => (
                      <tr key={s.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-3 font-medium text-slate-900">{s.productName}</td>
                        <td className="px-4 py-3 text-slate-500">{s.vendorName}</td>
                        <td className="px-4 py-3 text-slate-500">{formatDateTime(s.createdAt)}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                          {formatUsd(s.amountUsd)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <a
                            href={`https://stellar.expert/explorer/testnet/tx/${s.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-slate-400 underline decoration-dotted underline-offset-2 hover:text-slate-700"
                          >
                            verify ↗
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {tab === "vendors" && (
        <section className="mt-6">
          <InviteLink slug={slug} />
          {vendors.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              No vendors yet — share the invite link above.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {vendors.map((v) => (
                <div
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {v.name}
                      <span className="ml-2 text-xs font-normal text-slate-400">{v.email}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {v.sells || "—"} · {v.productCount} product{v.productCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    {v.registerTxHash && (
                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${v.registerTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 underline decoration-dotted underline-offset-2 hover:text-slate-700"
                      >
                        registered on-chain ↗
                      </a>
                    )}
                    <a
                      href={`/api/demo/impersonate?userId=${v.id}&redirect=/vendor/${slug}`}
                      className="rounded-full border border-slate-200 px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50"
                      title="Demo shortcut: switches your session to this vendor"
                    >
                      View their dashboard →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "products" && (
        <section className="mt-6">
          {catalog.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              The catalog is empty — vendors add products from their own dashboards.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              {catalog.map((p) => (
                <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <ProductVisual imageUrl={p.imageUrl} />
                  <div className="mt-3 flex items-baseline justify-between gap-2">
                    <p className="font-medium text-slate-900">{p.name}</p>
                    <p className="text-sm font-semibold tabular-nums text-slate-900">
                      {formatUsd(p.priceUsd)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">by {p.vendorName}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
        {value}
      </p>
    </div>
  );
}

function RevenueRow({ label, amount, dot }: { label: string; amount: number; dot: string }) {
  return (
    <p className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
      <span className="flex items-center gap-2 text-slate-600">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </span>
      <span className="font-semibold tabular-nums text-slate-900">{formatUsd(amount)}</span>
    </p>
  );
}

function InviteLink({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const url = `compaki.app/m/${slug}/join`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-medium text-slate-900">Invite vendors</p>
        <p className="mt-0.5 text-sm text-slate-500">
          Anyone with this link can register and start selling in about a minute.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <code className="rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
          {url}
        </code>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(`${window.location.origin}/m/${slug}/join`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1_500);
          }}
          className="rounded-full bg-navy-900 px-4 py-2 text-xs font-medium text-white hover:bg-navy-700"
        >
          {copied ? "Copied ✓" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
