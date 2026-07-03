"use client";

// Checkout for a pending order: shows the order summary and a live countdown
// (orders expire 10 minutes after creation), collects the shipping address,
// and pays. Payment settles one on-chain split per item, so the processing
// state can take a few seconds per line. A completed order shows the settled
// breakdown with receipt links.

import Link from "next/link";
import { useEffect, useState } from "react";

import { ProductVisual } from "@/components/shell";
import { formatUsd } from "@/lib/format";

const inputClass =
  "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 bg-white";

export interface OrderPayload {
  id: string;
  status: string;
  totalUsd: number;
  expiresAt: string;
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

interface SettledSale {
  saleId: string;
  productName: string;
  quantity: number;
  amountUsd: number;
  receiptPath: string;
  verifyUrl: string;
}

function secondsLeft(expiresAt: string): number {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

function Countdown({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const [left, setLeft] = useState(() => secondsLeft(expiresAt));

  useEffect(() => {
    const timer = setInterval(() => {
      const next = secondsLeft(expiresAt);
      setLeft(next);
      if (next <= 0) {
        clearInterval(timer);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, onExpire]);

  const minutes = Math.floor(left / 60);
  const seconds = left % 60;
  const urgent = left < 120;

  return (
    <p
      className={`rounded-xl px-4 py-2.5 text-center text-sm font-medium ${
        urgent ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
      }`}
    >
      ⏱ Order reserved for {minutes}:{String(seconds).padStart(2, "0")} — pay before it
      expires
    </p>
  );
}

export function OrderCheckout({
  order,
  user,
}: {
  order: OrderPayload;
  user: { name: string; email: string | null; country: string | null };
}) {
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState(user.country ?? "");
  const [state, setState] = useState<"idle" | "processing" | "done" | "expired">(
    order.status === "COMPLETED" ? "done" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [sales, setSales] = useState<SettledSale[]>([]);

  const valid =
    address.trim().length >= 5 && city.trim().length >= 2 && country.trim().length >= 2;

  const submit = async () => {
    setState("processing");
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipAddress: address,
          shipCity: city,
          shipPostalCode: postalCode,
          shipCountry: country,
        }),
      });
      const data = (await res.json()) as { sales?: SettledSale[]; error?: string };
      if (res.status === 410) {
        setState("expired");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Payment failed");
      setSales(data.sales ?? []);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
      setState("idle");
    }
  };

  if (state === "expired") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="text-3xl">⌛</p>
        <h1 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
          This order expired
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
          Orders are only valid for 10 minutes. You weren&apos;t charged — build your cart
          again and check out when you&apos;re ready.
        </p>
        <Link
          href={`/m/${order.marketplace.slug}`}
          className="mt-6 inline-block rounded-full bg-navy-900 px-7 py-2.5 text-sm font-medium text-white transition hover:bg-navy-700"
        >
          Back to {order.marketplace.name}
        </Link>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600"
          style={{ animation: "rise-in 0.4s ease-out both" }}
        >
          ✓
        </p>
        <h1
          className="mt-4 text-xl font-semibold tracking-tight text-slate-900"
          style={{ animation: "rise-in 0.4s ease-out 0.1s both" }}
        >
          Payment complete
        </h1>
        <p
          className="mt-1 text-sm text-slate-600"
          style={{ animation: "rise-in 0.4s ease-out 0.2s both" }}
        >
          Your {formatUsd(order.totalUsd)} order from {order.marketplace.name} settled
          on-chain:
        </p>

        <ul className="mt-5 space-y-2.5 text-left text-sm">
          {(sales.length > 0
            ? sales
            : order.items.map((item) => ({
                saleId: item.id,
                productName: item.productName,
                quantity: item.quantity,
                amountUsd: item.lineTotalUsd,
                receiptPath: item.receiptPath,
                verifyUrl: null as string | null,
              }))
          ).map((sale, i) => (
            <li
              key={sale.saleId}
              className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-2.5"
              style={{ animation: `rise-in 0.45s ease-out ${0.4 + i * 0.2}s both` }}
            >
              <span className="text-slate-600">
                {sale.quantity} × <span className="font-medium text-slate-900">{sale.productName}</span>
                {" — "}
                {formatUsd(sale.amountUsd)}
              </span>
              {sale.receiptPath && (
                <Link
                  href={sale.receiptPath}
                  className="text-xs font-medium text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                >
                  receipt →
                </Link>
              )}
            </li>
          ))}
        </ul>

        <div style={{ animation: "rise-in 0.45s ease-out 1s both" }}>
          <Link
            href="/orders"
            className="mt-6 inline-block rounded-full bg-navy-900 px-7 py-3 text-sm font-medium text-white transition hover:bg-navy-700"
          >
            View my orders →
          </Link>
          <p className="mt-3 text-xs text-slate-500">
            <Link href={`/m/${order.marketplace.slug}`} className="hover:text-slate-700">
              back to {order.marketplace.name}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link
        href={`/m/${order.marketplace.slug}/cart`}
        className="text-sm text-slate-500 transition hover:text-slate-700"
      >
        ← Back to cart
      </Link>

      {/* Order summary */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-100">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center gap-4 px-5 py-3">
              <div className="w-10 shrink-0">
                <ProductVisual imageUrl={item.imageUrl} size="sm" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{item.productName}</p>
                <p className="text-xs text-slate-500">
                  {item.quantity} × {formatUsd(item.unitPriceUsd)}
                </p>
              </div>
              <p className="text-sm font-semibold tabular-nums text-slate-900">
                {formatUsd(item.lineTotalUsd)}
              </p>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          <span className="text-sm font-medium text-slate-600">Total</span>
          <span className="font-semibold tabular-nums text-slate-900">
            {formatUsd(order.totalUsd)}
          </span>
        </div>
      </div>

      <div className="mt-4">
        <Countdown expiresAt={order.expiresAt} onExpire={() => setState("expired")} />
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="mb-5 rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
          Buying as <span className="font-medium text-slate-900">{user.name}</span>
          {user.email ? ` (${user.email})` : ""}
        </p>

        <div className="mb-5">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Shipping address
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, number, apartment…"
            className={inputClass}
            disabled={state === "processing"}
          />
        </div>
        <div className="mb-5 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="San José"
              className={inputClass}
              disabled={state === "processing"}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Postal code <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="10101"
              className={inputClass}
              disabled={state === "processing"}
            />
          </div>
        </div>
        <div className="mb-6">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Country</label>
          <input
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="Costa Rica"
            className={inputClass}
            disabled={state === "processing"}
          />
        </div>

        {error && (
          <p className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          onClick={() => void submit()}
          disabled={!valid || state === "processing"}
          className="w-full rounded-full bg-navy-900 px-6 py-3.5 text-base font-medium text-white transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {state === "processing" ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Processing payment…
            </span>
          ) : (
            `Pay ${formatUsd(order.totalUsd)}`
          )}
        </button>

        <p className="mt-3 text-center text-xs text-slate-400">
          {state === "processing"
            ? "Settling on-chain — this can take a few seconds per item."
            : "🔒 Demo: payment simulated with test funds."}
        </p>
      </div>
    </div>
  );
}
