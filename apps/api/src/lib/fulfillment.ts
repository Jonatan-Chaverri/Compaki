// Order fulfilment, per sale (one sale per order item): the item's vendor
// moves it from PAID (to ship) to SHIPPED, optionally with tracking, and then
// to DELIVERED. A local hand-over can go straight from PAID to DELIVERED.
// Statuses never go back.

export const FULFILLMENT_STATUSES = ["PAID", "SHIPPED", "DELIVERED"] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

export interface FulfillmentView {
  status: FulfillmentStatus;
  trackingInfo: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
}

export function fulfillmentOf(sale: {
  fulfillmentStatus: string;
  trackingInfo: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
}): FulfillmentView {
  const status = (FULFILLMENT_STATUSES as readonly string[]).includes(sale.fulfillmentStatus)
    ? (sale.fulfillmentStatus as FulfillmentStatus)
    : "PAID";
  return {
    status,
    trackingInfo: sale.trackingInfo,
    shippedAt: sale.shippedAt?.toISOString() ?? null,
    deliveredAt: sale.deliveredAt?.toISOString() ?? null,
  };
}

/** Whether `from` may move to `to` (forward only; tracking can be edited while shipped). */
export function canAdvance(from: FulfillmentStatus, to: FulfillmentStatus): boolean {
  if (to === "SHIPPED") return from === "PAID" || from === "SHIPPED";
  if (to === "DELIVERED") return from === "PAID" || from === "SHIPPED";
  return false;
}
