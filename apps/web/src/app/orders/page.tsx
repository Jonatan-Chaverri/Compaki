// "My orders" — the session buyer's orders, split into pending (still payable,
// with a live countdown) and completed. Expired orders are hidden by design.


import { AppHeader, PageHeading, EmptyState } from "@/components/shell";
import { apiFetch } from "@/lib/api";

import { OrdersList, type OrderRow } from "./orders-list";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const res = await apiFetch("/api/orders");

  if (res.status === 401) {
    return (
      <div className="min-h-screen bg-slate-50/60">
        <AppHeader />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-xl px-6 py-20 text-center">
          <EmptyState icon="bag" title="Your good finds, all in one place." description="Sign in to see your orders, continue a checkout, or revisit the people you’ve supported." href="/login?next=/orders" action="Sign in to see orders" />
        </main>
      </div>
    );
  }
  if (!res.ok) throw new Error(`Orders request failed (${res.status})`);
  const { orders } = (await res.json()) as { orders: OrderRow[] };

  return (
    <div className="min-h-screen bg-slate-50/60">
      <AppHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-6 py-12">
        <PageHeading eyebrow="Your Compaki" title="Your good finds." description="Keep track of your purchases and see the people behind every order. Pending checkouts are reserved for 10 minutes." />
        <OrdersList orders={orders} />
      </main>
    </div>
  );
}
