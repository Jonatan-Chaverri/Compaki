import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { formatDateTime, formatUsd } from "@/lib/format";

interface ReceiptPayload {
  sale: {
    id: string;
    amountUsd: number;
    txHash: string;
    settleSeconds: number | null;
    createdAt: string;
  };
  product: { name: string; imageUrl: string | null };
  buyer: { name: string };
  marketplace: { name: string; slug: string };
  breakdown: {
    key: string;
    role: string;
    recipient: string;
    amountUsd: number;
    percent: number;
  }[];
  verifyUrl: string;
}

const DOT_COLORS: Record<string, string> = {
  vendor: "bg-slate-900",
  platform: "bg-slate-400",
  community: "bg-emerald-500",
};

const BAR_COLORS: Record<string, string> = {
  vendor: "bg-slate-900",
  platform: "bg-slate-400",
  community: "bg-emerald-500",
};

async function getReceipt(saleId: string): Promise<ReceiptPayload | null> {
  const res = await apiFetch(`/api/sales/${encodeURIComponent(saleId)}/receipt`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Receipt request failed (${res.status})`);
  return (await res.json()) as ReceiptPayload;
}

export async function generateMetadata(props: {
  params: Promise<{ saleId: string }>;
}): Promise<Metadata> {
  const { saleId } = await props.params;
  const receipt = await getReceipt(saleId);
  if (!receipt) return { title: "Receipt — Compaki" };

  const title = `Where your money went — ${formatUsd(receipt.sale.amountUsd)} at ${receipt.marketplace.name}`;
  const description = receipt.breakdown
    .map((row) => `${formatUsd(row.amountUsd)} to ${row.recipient} (${row.role})`)
    .join(" · ");
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Compaki",
    },
    twitter: { card: "summary", title, description },
  };
}

export const dynamic = "force-dynamic";

export default async function ReceiptPage(props: { params: Promise<{ saleId: string }> }) {
  const { saleId } = await props.params;
  const receipt = await getReceipt(saleId);
  if (!receipt) notFound();

  const { sale, product, buyer, marketplace, breakdown, verifyUrl } = receipt;

  return (
    <div className="min-h-screen bg-slate-50/60">
      <AppHeader right={<span className="text-sm text-slate-500">Transparent receipt</span>} />
      <main className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Where your money went
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {product.name} · {marketplace.name} · {formatDateTime(sale.createdAt)}
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {/* Buyer node */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Buyer
              </p>
              <p className="font-medium text-slate-900">{buyer.name}</p>
            </div>
            <p className="text-2xl font-semibold tracking-tight text-slate-900">
              {formatUsd(sale.amountUsd)}
            </p>
          </div>

          {/* Split bar */}
          <div className="mt-4 flex h-2 overflow-hidden rounded-full">
            {breakdown.map((row) => (
              <div
                key={row.key}
                className={BAR_COLORS[row.key] ?? "bg-slate-300"}
                style={{ width: `${row.percent}%` }}
              />
            ))}
          </div>

          {/* Recipient rows */}
          <ul className="mt-5 space-y-3">
            {breakdown.map((row) => (
              <li
                key={row.key}
                className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${DOT_COLORS[row.key] ?? "bg-slate-300"}`}
                    />
                    <span className="truncate font-medium text-slate-900">{row.recipient}</span>
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">
                      {row.role}
                    </span>
                  </span>
                  <span className="ml-auto font-semibold tabular-nums text-slate-900">
                    {formatUsd(row.amountUsd)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between pl-4 text-xs">
                  <span className="text-slate-500">{row.percent}% of the sale</span>
                  <a
                    href={verifyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-emerald-700 hover:text-emerald-800"
                  >
                    Verified ✓
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* The one and only blockchain mention — framed as trust. */}
        <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">
          This payment was settled on the Stellar network in{" "}
          {sale.settleSeconds !== null ? `${sale.settleSeconds} seconds` : "seconds"} and cannot
          be altered.{" "}
          <a
            href={verifyUrl}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
          >
            See the transaction ↗
          </a>
        </p>

        <p className="mt-8 text-center text-sm">
          <Link
            href={`/m/${marketplace.slug}`}
            className="text-slate-500 transition hover:text-slate-700"
          >
            ← Shop at {marketplace.name}
          </Link>
        </p>
      </main>
    </div>
  );
}
