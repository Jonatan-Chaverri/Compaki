"use client";
// Delivery status UI: the status pill (buyers and vendors) and the vendor's
// "mark shipped / delivered" actions.

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Modal } from "@/components/product-modal";
import { localizedMessage } from "@/i18n/errors";
import type { Fulfillment, FulfillmentStatus } from "@/lib/fulfillment";
import { formatDateTime } from "@/lib/format";

const PILL: Record<FulfillmentStatus, string> = {
  PAID: "bg-amber-50 text-amber-700",
  SHIPPED: "bg-sky-50 text-sky-700",
  DELIVERED: "bg-emerald-50 text-emerald-700",
};

export function FulfillmentBadge({ status, audience }: { status: FulfillmentStatus; audience: "buyer" | "vendor" }) {
  const t = useTranslations("ui");
  const label =
    status === "DELIVERED"
      ? t("fulfillmentDelivered")
      : status === "SHIPPED"
        ? t("fulfillmentShipped")
        : audience === "vendor"
          ? t("fulfillmentToShip")
          : t("fulfillmentPreparing");
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${PILL[status]}`}>
      {label}
    </span>
  );
}

/** Dates and tracking under the pill. */
export function FulfillmentDetails({ fulfillment }: { fulfillment: Fulfillment }) {
  const t = useTranslations("ui");
  const locale = useLocale();
  return (
    <span className="mt-1 block text-xs leading-relaxed text-slate-500">
      {fulfillment.deliveredAt && (
        <span className="block">{t("deliveredOn", { date: formatDateTime(fulfillment.deliveredAt, locale) })}</span>
      )}
      {fulfillment.shippedAt && !fulfillment.deliveredAt && (
        <span className="block">{t("shippedOn", { date: formatDateTime(fulfillment.shippedAt, locale) })}</span>
      )}
      {fulfillment.trackingInfo && (
        <span className="block break-words">{t("trackingValue", { tracking: fulfillment.trackingInfo })}</span>
      )}
    </span>
  );
}

async function updateFulfillment(saleId: string, body: { status: "SHIPPED" | "DELIVERED"; trackingInfo?: string }) {
  const res = await fetch(`/api/sales/${encodeURIComponent(saleId)}/fulfillment`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { fulfillment?: Fulfillment; error?: string };
  if (!res.ok || !data.fulfillment) throw new Error(data.error ?? "");
  return data.fulfillment;
}

/** The vendor's next steps for one sold item. */
export function FulfillmentActions({
  saleId,
  fulfillment,
  onChange,
}: {
  saleId: string;
  fulfillment: Fulfillment;
  onChange: (next: Fulfillment) => void;
}) {
  const t = useTranslations("ui");
  const [shipping, setShipping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (fulfillment.status === "DELIVERED") return null;

  const markDelivered = async () => {
    setBusy(true);
    setError(null);
    try {
      onChange(await updateFulfillment(saleId, { status: "DELIVERED" }));
    } catch (err) {
      setError(localizedMessage(err, t, t("couldNotUpdateDeliveryStatus")));
    } finally {
      setBusy(false);
    }
  };

  const button =
    "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50";
  return (
    <span className="mt-2 flex flex-wrap gap-1.5">
      {fulfillment.status === "PAID" && (
        <button type="button" className={button} disabled={busy} onClick={() => setShipping(true)}>
          {t("markShipped")}
        </button>
      )}
      <button type="button" className={button} disabled={busy} onClick={markDelivered}>
        {t("markDelivered")}
      </button>
      {error && <span role="alert" className="block w-full text-xs text-red-600">{error}</span>}
      {shipping && (
        <ShipModal
          saleId={saleId}
          onClose={() => setShipping(false)}
          onShipped={(next) => {
            setShipping(false);
            onChange(next);
          }}
        />
      )}
    </span>
  );
}

function ShipModal({
  saleId,
  onClose,
  onShipped,
}: {
  saleId: string;
  onClose: () => void;
  onShipped: (next: Fulfillment) => void;
}) {
  const t = useTranslations("ui");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onShipped(await updateFulfillment(saleId, { status: "SHIPPED", trackingInfo: tracking }));
    } catch (err) {
      setError(localizedMessage(err, t, t("couldNotUpdateDeliveryStatus")));
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} label={t("markShipped")}>
      <form onSubmit={submit}>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">{t("markAsShipped")}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("theBuyerWillSeeItAsShippedInTheirOrders")}</p>
        <label htmlFor="tracking-info" className="mb-1.5 mt-4 block text-sm font-medium text-slate-700">
          {t("trackingInfo")} <span className="font-normal text-slate-400">{t("optional")}</span>
        </label>
        <input
          id="tracking-info"
          value={tracking}
          maxLength={200}
          onChange={(e) => setTracking(e.target.value)}
          placeholder={t("trackingInfoPlaceholder")}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500"
        />
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
            {t("cancel")}
          </button>
          <button type="submit" disabled={busy} className="rounded-full bg-navy-900 px-6 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-50">
            {busy ? t("saving") : t("markShipped")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
