// "My orders" — the session buyer's orders, split into pending (still payable,
// with a live countdown) and completed. Expired orders are hidden by design.

import Link from "next/link";

import { AppHeader } from "@/components/shell";
import { apiFetch } from "@/lib/api";

import { OrdersList, type OrderRow } from "./orders-list";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const res = await apiFetch("/api/orders");

  if (res.status === 401) {
    return (
      <div className="min-h-screen bg-slate-50/60">
        <AppHeader />
        <main className="mx-auto w-full max-w-xl px-6 py-20 text-center">
          <p className="text-3xl">🔐</p>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
            Sign in to see your orders
          </h1>
          <Link
            href="/login?next=/orders"
            className="mt-6 inline-block rounded-full bg-navy-900 px-7 py-3 text-sm font-medium text-white transition hover:bg-navy-700"
          >
            Sign in
          </Link>
        </main>
      </div>
    );
  }
  if (!res.ok) throw new Error(`Orders request failed (${res.status})`);
  const { orders } = (await res.json()) as { orders: OrderRow[] };

  return (
    <div className="min-h-screen bg-slate-50/60">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My orders</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pending orders stay payable for 10 minutes; after that they expire.
        </p>
        <OrdersList orders={orders} />
      </main>
    </div>
  );
}
