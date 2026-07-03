"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ProductVisual } from "@/components/shell";
import { formatDateTime, formatUsd } from "@/lib/format";

export interface OrderRow {
  id: string;
  status: string; // "PENDING" | "COMPLETED"
  totalUsd: number;
  expiresAt: string;
  createdAt: string;
  completedAt: string | null;
  marketplace: { name: string; slug: string };
  items: {
    id: string;
    productId: string;
    productName: string;
    imageUrl: string | null;
    quantity: number;
    unitPriceUsd: number;
    lineTotalUsd: number;
    receiptPath: string | null;
  }[];
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
        active ? "bg-navy-900 text-white" : "text-slate-500 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

/** Live m:ss until the order expires; hides the order once it hits zero. */
function PendingCountdown({ expiresAt }: { expiresAt: string }) {
  const compute = () =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const [left, setLeft] = useState(compute);

  useEffect(() => {
    const timer = setInterval(() => setLeft(compute()), 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  if (left <= 0) return <span className="text-xs font-medium text-red-600">Expired</span>;
  return (
    <span className="text-xs font-medium text-amber-700">
      ⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} left to pay
    </span>
  );
}

function OrderCard({ order }: { order: OrderRow }) {
  const pending = order.status === "PENDING";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-900">
            <Link href={`/m/${order.marketplace.slug}`} className="hover:underline">
              {order.marketplace.name}
            </Link>
          </p>
          <p className="text-xs text-slate-500">{formatDateTime(order.createdAt)}</p>
        </div>
        <div className="flex items-center gap-3">
          {pending ? (
            <PendingCountdown expiresAt={order.expiresAt} />
          ) : (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              Completed
            </span>
          )}
          <span className="font-semibold tabular-nums text-slate-900">
            {formatUsd(order.totalUsd)}
          </span>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 text-sm">
            <div className="w-8 shrink-0">
              <ProductVisual imageUrl={item.imageUrl} size="sm" />
            </div>
            <span className="min-w-0 flex-1 truncate text-slate-700">
              {item.quantity} × {item.productName}
            </span>
            {item.receiptPath && (
              <Link
                href={item.receiptPath}
                className="text-xs font-medium text-slate-400 underline decoration-slate-200 underline-offset-2 hover:text-slate-700"
              >
                receipt
              </Link>
            )}
            <span className="tabular-nums text-slate-500">{formatUsd(item.lineTotalUsd)}</span>
          </li>
        ))}
      </ul>

      {pending && (
        <Link
          href={`/m/${order.marketplace.slug}/checkout/${order.id}`}
          className="mt-4 block rounded-full bg-navy-900 px-5 py-2.5 text-center text-sm font-medium text-white transition hover:bg-navy-700"
        >
          Complete checkout →
        </Link>
      )}
    </div>
  );
}

export function OrdersList({ orders }: { orders: OrderRow[] }) {
  const [tab, setTab] = useState<"PENDING" | "COMPLETED">("PENDING");
  const pending = orders.filter((o) => o.status === "PENDING");
  const completed = orders.filter((o) => o.status === "COMPLETED");
  const shown = tab === "PENDING" ? pending : completed;

  return (
    <div className="mt-6">
      <div className="flex gap-2">
        <TabButton active={tab === "PENDING"} onClick={() => setTab("PENDING")}>
          Pending ({pending.length})
        </TabButton>
        <TabButton active={tab === "COMPLETED"} onClick={() => setTab("COMPLETED")}>
          Completed ({completed.length})
        </TabButton>
      </div>

      {shown.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center text-sm text-slate-500">
          {tab === "PENDING"
            ? "No pending orders — add something to a cart and proceed to payment."
            : "No completed orders yet."}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {shown.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}
