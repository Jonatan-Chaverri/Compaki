"use client";

import Link from "next/link";
import { useState } from "react";

const inputClass =
  "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 bg-white";

export function JoinForm({
  slug,
  marketplaceName,
  user,
}: {
  slug: string;
  marketplaceName: string;
  user: { name: string; email: string | null } | null;
}) {
  const [sells, setSells] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setState("submitting");
    setError(null);
    try {
      const res = await fetch(`/api/marketplaces/${slug}/vendors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sells }),
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

  if (!user) {
    const next = encodeURIComponent(`/m/${slug}/join`);
    return (
      <div className="py-2 text-center">
        <p className="text-sm text-slate-600">
          Sign in or create a Compaki account first — you&apos;ll join {marketplaceName} as that
          account.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Link
            href={`/login?next=${next}`}
            className="rounded-full bg-navy-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-navy-700"
          >
            Sign in
          </Link>
          <Link
            href={`/login?mode=register&next=${next}`}
            className="rounded-full border border-slate-200 px-6 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Create account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-5 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Joining as <span className="font-medium text-slate-900">{user.name}</span>
        {user.email && <span className="text-slate-400"> · {user.email}</span>}
      </p>
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
        disabled={state === "submitting"}
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
