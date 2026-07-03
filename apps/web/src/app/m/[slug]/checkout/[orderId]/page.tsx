import Link from "next/link";
import { notFound } from "next/navigation";

import { apiFetch } from "@/lib/api";

import { OrderCheckout, type OrderPayload } from "./order-checkout";

export const dynamic = "force-dynamic";

export default async function CheckoutPage(props: {
  params: Promise<{ slug: string; orderId: string }>;
}) {
  const { slug, orderId } = await props.params;
  const [res, meRes] = await Promise.all([
    apiFetch(`/api/orders/${encodeURIComponent(orderId)}`),
    apiFetch("/api/me"),
  ]);
  if (res.status === 404 || res.status === 401) notFound();
  if (!res.ok) throw new Error(`Order request failed (${res.status})`);
  const { order } = (await res.json()) as { order: OrderPayload };
  if (order.marketplace.slug !== slug) notFound();
  const { user } = (await meRes.json()) as {
    user: { name: string; email: string | null; country: string | null } | null;
  };
  if (!user) notFound();

  if (order.status === "EXPIRED") {
    return (
      <main className="mx-auto w-full max-w-xl px-6 py-16 text-center">
        <p className="text-3xl">⌛</p>
        <h1 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
          This order expired
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
          Orders are only valid for 10 minutes. Your cart wasn&apos;t charged — build it
          again and check out when you&apos;re ready.
        </p>
        <Link
          href={`/m/${order.marketplace.slug}`}
          className="mt-6 inline-block rounded-full bg-navy-900 px-7 py-2.5 text-sm font-medium text-white transition hover:bg-navy-700"
        >
          Back to {order.marketplace.name}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-12">
      <OrderCheckout order={order} user={user} />
    </main>
  );
}
