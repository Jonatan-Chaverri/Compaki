import { getTranslations } from "next-intl/server";
// "My orders" — the session buyer's orders, split into pending (still payable,
// with a live countdown) and completed. Expired orders are hidden by design.

import { AppHeader, PageHeading, EmptyState } from "@/components/shell";
import { apiFetch } from "@/lib/api";

import { OrdersList, type OrderRow } from "./orders-list";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const t = await getTranslations("ui");

  const res = await apiFetch("/api/orders");

  if (res.status === 401) {
    return (
      <div className="min-h-screen bg-slate-50/60">
        <AppHeader />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-xl px-6 py-20 text-center">
          <EmptyState icon="bag" title={t("yourGoodFindsAllInOnePlace")} description={t("signInToSeeYourOrdersContinueACheckoutOrRevisit")} href="/login?next=/orders" action={t("signInToSeeOrders")} />
        </main>
      </div>
    );
  }
  if (!res.ok) throw new Error(t("ordersRequestFailedValue", { value1: res.status }));
  const { orders } = (await res.json()) as { orders: OrderRow[] };

  return (
    <div className="min-h-screen bg-slate-50/60">
      <AppHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-6 py-12">
        <PageHeading eyebrow={t("yourCompaki")} title={t("yourGoodFinds")} description={t("keepTrackOfYourPurchasesAndSeeThePeopleBehindEvery")} />
        <OrdersList orders={orders} />
      </main>
    </div>
  );
}
