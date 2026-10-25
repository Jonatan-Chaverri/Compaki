"use client";
import { useLocale } from "next-intl";

import { useTranslations } from "next-intl";

import Link from "next/link";
import { useEffect, useState } from "react";

import { FulfillmentBadge } from "@/components/fulfillment";
import { ProductVisual, EmptyState } from "@/components/shell";
import { formatDateTime, formatUsd } from "@/lib/format";
import { orderFulfillmentStatus, type Fulfillment } from "@/lib/fulfillment";

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
    fulfillment: Fulfillment | null;
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
      aria-pressed={active}
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
  const t = useTranslations("ui");

  const compute = () =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const [left, setLeft] = useState(compute);

  useEffect(() => {
    const timer = setInterval(() => setLeft(compute()), 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  if (left <= 0) return <span className="text-xs font-medium text-red-600">{t("expired")}</span>;
  return (
    <span className="text-xs font-medium text-amber-700">
      ⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} {" "}{t("leftToPay")}</span>
  );
}

/** One item's delivery line: status, date and tracking, as the vendor reported them. */
function ItemDelivery({ fulfillment }: { fulfillment: Fulfillment }) {
  const locale = useLocale();
  const t = useTranslations("ui");
  const text =
    fulfillment.status === "DELIVERED" && fulfillment.deliveredAt
      ? t("deliveredOn", { date: formatDateTime(fulfillment.deliveredAt, locale) })
      : fulfillment.status === "SHIPPED" && fulfillment.shippedAt
        ? t("shippedOn", { date: formatDateTime(fulfillment.shippedAt, locale) })
        : t("theSellerIsPreparingIt");
  const tone =
    fulfillment.status === "DELIVERED" ? "text-emerald-700" : fulfillment.status === "SHIPPED" ? "text-sky-700" : "text-slate-400";
  return (
    <span className={`block text-xs ${tone}`}>
      {text}
      {fulfillment.trackingInfo && <span className="text-slate-500"> · {t("trackingValue", { tracking: fulfillment.trackingInfo })}</span>}
    </span>
  );
}

function OrderCard({ order }: { order: OrderRow }) {
  const locale = useLocale();

  const t = useTranslations("ui");

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
          <p className="text-xs text-slate-500">{formatDateTime(order.createdAt, locale)}</p>
        </div>
        <div className="flex items-center gap-3">
          {pending ? (
            <PendingCountdown expiresAt={order.expiresAt} />
          ) : (
            <FulfillmentBadge status={orderFulfillmentStatus(order.items)} audience="buyer" />
          )}
          <span className="font-semibold tabular-nums text-slate-900">
            {formatUsd(order.totalUsd, locale)}
          </span>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 text-sm">
            <div className="w-14 shrink-0">
              <ProductVisual imageUrl={item.imageUrl} size="sm" />
            </div>
            <span className="min-w-0 flex-1 text-slate-700">
              <span className="block truncate">{item.quantity} × {item.productName}</span>
              {!pending && item.fulfillment && <ItemDelivery fulfillment={item.fulfillment} />}
            </span>
            {item.receiptPath && (
              <Link
                href={item.receiptPath}
                className="text-xs font-medium text-slate-400 underline decoration-slate-200 underline-offset-2 hover:text-slate-700"
              >
                {t("receipt3")}</Link>
            )}
            <span className="tabular-nums text-slate-500">{formatUsd(item.lineTotalUsd, locale)}</span>
          </li>
        ))}
      </ul>

      {pending && (
        <Link
          href={`/m/${order.marketplace.slug}/checkout/${order.id}`}
          className="mt-4 block rounded-full bg-navy-900 px-5 py-2.5 text-center text-sm font-medium text-white transition hover:bg-navy-700"
        >
          {t("completeCheckout")}</Link>
      )}
    </div>
  );
}

export function OrdersList({ orders }: { orders: OrderRow[] }) {
  const t = useTranslations("ui");

  const [tab, setTab] = useState<"PENDING" | "COMPLETED">(orders.some(o => o.status === "PENDING") ? "PENDING" : "COMPLETED");
  const pending = orders.filter((o) => o.status === "PENDING");
  const completed = orders.filter((o) => o.status === "COMPLETED");
  const shown = tab === "PENDING" ? pending : completed;

  return (
    <div className="mt-6">
      <div className="dashboard-tabs">
        <TabButton active={tab === "PENDING"} onClick={() => setTab("PENDING")}>
          {t("pending")}{pending.length})
        </TabButton>
        <TabButton active={tab === "COMPLETED"} onClick={() => setTab("COMPLETED")}>
          {t("completed2")}{completed.length})
        </TabButton>
      </div>

      {shown.length === 0 ? (
        <div className="mt-4"><EmptyState title={tab === "PENDING" ? t("youReAllCaughtUp") : t("yourFirstGoodFindIsWaiting")} description={tab === "PENDING" ? t("noCheckoutsToFinishExploreAMarketplaceAndDiscoverSomethingSpecial") : t("onceYouCompleteAnOrderYouLlFindItHereAlong")} href="/marketplaces" action={t("exploreMarketplaces")} /></div>
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
