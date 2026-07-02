"use client";

// Simulated card checkout for signed-in buyers: the session identifies the
// buyer, the form collects the shipping address, and the API provisions a
// custodial account pre-funded with demo USDC and settles the split on-chain.
// The processing state covers the ~5-10s the chain takes. Logged-out visitors
// get a sign-in prompt instead.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { formatUsd } from "@/lib/format";

const inputClass =
  "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400 bg-white";

interface BreakdownRow {
  key: string;
  label: string;
  recipient: string;
  amountUsd: number;
}

interface PurchaseResult {
  sale: { id: string; amountUsd: number; txHash: string };
  breakdown: BreakdownRow[];
  verifyUrl: string;
  receiptPath: string;
}

const DOT_COLORS: Record<string, string> = {
  vendor: "bg-slate-900",
  platform: "bg-slate-400",
  community: "bg-emerald-500",
};

export function CheckoutForm({
  productId,
  productName,
  priceUsd,
  marketplaceSlug,
  marketplaceName,
  user,
}: {
  productId: string;
  productName: string;
  priceUsd: number;
  marketplaceSlug: string;
  marketplaceName: string;
  user: { name: string; email: string | null; country: string | null } | null;
}) {
  const pathname = usePathname();
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState(user?.country ?? "");
  const [state, setState] = useState<"idle" | "processing" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PurchaseResult | null>(null);

  const valid =
    address.trim().length >= 5 && city.trim().length >= 2 && country.trim().length >= 2;

  const submit = async () => {
    setState("processing");
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipAddress: address,
          shipCity: city,
          shipPostalCode: postalCode,
          shipCountry: country,
        }),
      });
      const data = (await res.json()) as PurchaseResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Payment failed");
      setResult(data);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
      setState("idle");
    }
  };

  if (!user) {
    return (
      <div className="py-4 text-center">
        <p className="text-3xl">🔐</p>
        <h2 className="mt-3 text-lg font-semibold tracking-tight text-slate-900">
          Sign in to buy
        </h2>
        <p className="mx-auto mt-2 max-w-xs text-sm text-slate-600">
          You can browse every marketplace freely — buying just needs an account, so your
          orders and receipts stay yours.
        </p>
        <Link
          href={`/login?next=${encodeURIComponent(pathname)}`}
          className="mt-6 inline-block rounded-full bg-slate-900 px-8 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Sign in or create account
        </Link>
      </div>
    );
  }

  if (state === "done" && result) {
    return (
      <div className="py-2 text-center">
        <p
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600"
          style={{ animation: "rise-in 0.4s ease-out both" }}
        >
          ✓
        </p>
        <h2
          className="mt-4 text-xl font-semibold tracking-tight text-slate-900"
          style={{ animation: "rise-in 0.4s ease-out 0.1s both" }}
        >
          Payment complete
        </h2>
        <p
          className="mt-1 text-sm text-slate-600"
          style={{ animation: "rise-in 0.4s ease-out 0.2s both" }}
        >
          Your {formatUsd(result.sale.amountUsd)} for {productName} settled in seconds:
        </p>

        <ul className="mt-5 space-y-2.5 text-left text-sm">
          {result.breakdown.map((row, i) => (
            <li
              key={row.key}
              className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-2.5"
              style={{ animation: `rise-in 0.45s ease-out ${0.4 + i * 0.35}s both` }}
            >
              <span className="flex items-center gap-2 text-slate-600">
                <span className={`h-2 w-2 rounded-full ${DOT_COLORS[row.key] ?? "bg-slate-300"}`} />
                → {formatUsd(row.amountUsd)} to{" "}
                <span className="font-medium text-slate-900">{row.recipient}</span>
              </span>
              <span className="text-xs text-slate-400">({row.label})</span>
            </li>
          ))}
        </ul>

        <div style={{ animation: "rise-in 0.45s ease-out 1.6s both" }}>
          <Link
            href={result.receiptPath}
            className="mt-6 inline-block rounded-full bg-slate-900 px-7 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            See where your money went →
          </Link>
          <p className="mt-3 text-xs text-slate-500">
            <a
              href={result.verifyUrl}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
            >
              verified on-chain ↗
            </a>
            {" · "}
            <Link href={`/m/${marketplaceSlug}`} className="hover:text-slate-700">
              back to {marketplaceName}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
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
        onClick={submit}
        disabled={!valid || state === "processing"}
        className="w-full rounded-full bg-slate-900 px-6 py-3.5 text-base font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {state === "processing" ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Processing payment…
          </span>
        ) : (
          `Pay ${formatUsd(priceUsd)}`
        )}
      </button>

      <p className="mt-3 text-center text-xs text-slate-400">
        {state === "processing"
          ? "Settling on-chain — this usually takes a few seconds."
          : "🔒 Demo: payment simulated with test funds."}
      </p>
    </div>
  );
}
