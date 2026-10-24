"use client";

// Password sign-in for existing accounts (demo/seeded accounts and accounts
// created before Cavos). New accounts are created with email sign-in (Cavos).
// ?next=/some/path returns the user to where they were after auth.

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500";

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && password.length > 0;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      router.push(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <form
      className="auth-fields mt-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && !busy) void submit();
      }}
    >
      <div className="mb-4">
        <label htmlFor="auth-email" className="mb-1.5 block text-sm font-medium text-slate-700">Email address</label>
        <input
          id="auth-email"
          autoComplete="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ana@example.com"
          className={inputClass}
          disabled={busy}
        />
      </div>
      <div className="mb-4">
        <label htmlFor="auth-password" className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
        <input
          id="auth-password"
          autoComplete="current-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
          className={inputClass}
          disabled={busy}
        />
      </div>
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!valid || busy}
        className="w-full rounded-full border border-slate-200 bg-white px-7 py-3 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Signing in…" : "Sign in with password"}
      </button>
    </form>
  );
}
