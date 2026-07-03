"use client";

import Link from "next/link";
import { useState } from "react";

const inputClass =
  "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 bg-white";

export function JoinForm({
  slug,
  marketplaceName,
}: {
  slug: string;
  marketplaceName: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sells, setSells] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const valid = name.trim().length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  const submit = async () => {
    setState("submitting");
    setError(null);
    try {
      const res = await fetch(`/api/marketplaces/${slug}/vendors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, sells }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Registration failed");
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setState("idle");
    }
  };

  if (state === "done") {
    return (
      <div className="py-4 text-center">
        <p className="text-4xl">🎉</p>
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
          You&apos;re in — add your first product
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Your payment account is ready. Money from every sale lands in it within seconds.
        </p>
        <Link
          href={`/vendor/${slug}`}
          className="mt-6 inline-block rounded-full bg-navy-900 px-7 py-3 text-sm font-medium text-white transition hover:bg-navy-700"
        >
          Go to my products
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Your name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rosa Jiménez"
          className={inputClass}
          disabled={state === "submitting"}
        />
      </div>
      <div className="mb-5">
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="rosa@example.com"
          className={inputClass}
          disabled={state === "submitting"}
        />
      </div>
      <div className="mb-6">
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          What do you sell?
        </label>
        <input
          type="text"
          value={sells}
          onChange={(e) => setSells(e.target.value)}
          placeholder="Hand-roasted coffee from my family farm"
          maxLength={200}
          className={inputClass}
          disabled={state === "submitting"}
        />
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        onClick={() => void submit()}
        disabled={!valid || state === "submitting"}
        className="w-full rounded-full bg-navy-900 px-7 py-3 text-sm font-medium text-white transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {state === "submitting" ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Setting up your payment account… (~15s)
          </span>
        ) : (
          `Join ${marketplaceName}`
        )}
      </button>
      <p className="mt-3 text-center text-xs text-slate-400">
        We create your payment account automatically — no bank details needed to start.
      </p>
    </div>
  );
}
