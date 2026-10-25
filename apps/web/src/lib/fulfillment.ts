// Delivery status of one purchased item, as the API reports it
// (apps/api/src/lib/fulfillment.ts). The vendor advances it; buyers see it.

export type FulfillmentStatus = "PAID" | "SHIPPED" | "DELIVERED";

export interface Fulfillment {
  status: FulfillmentStatus;
  trackingInfo: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
}

/** One status for a whole order: the least advanced of its items. */
export function orderFulfillmentStatus(items: { fulfillment: Fulfillment | null }[]): FulfillmentStatus {
  const statuses = items.map((item) => item.fulfillment?.status ?? "PAID");
  if (statuses.length > 0 && statuses.every((s) => s === "DELIVERED")) return "DELIVERED";
  if (statuses.some((s) => s !== "PAID")) return "SHIPPED";
  return "PAID";
}
