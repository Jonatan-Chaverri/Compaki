"use client";

// Sign in / create account. One session works across all marketplaces.
// ?next=/some/path returns the user to where they were after auth.

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400";

type Mode = "signin" | "register";

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const valid =
    mode === "signin"
      ? emailValid && password.length > 0
      : name.trim().length >= 2 &&
        emailValid &&
        password.length >= 8 &&
        country.trim().length >= 2;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(mode === "signin" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "signin" ? { email, password } : { name, email, password, country },
        ),
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

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  return (
    <div>
      <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900">
        {mode === "signin" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-2 text-center text-sm text-slate-500">
        One account for everything — buy, sell, or run a marketplace.
      </p>

      <div className="mt-6 flex rounded-full border border-slate-200 bg-white p-1">
        {(
          [
            ["signin", "Sign in"],
            ["register", "Create account"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={`flex-1 rounded-full py-2 text-sm font-medium transition ${
              mode === m ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        {mode === "register" && (
          <div className="mb-5">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Your name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ana Retana"
              className={inputClass}
              disabled={busy}
            />
          </div>
        )}

        <div className="mb-5">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ana@example.com"
            className={inputClass}
            disabled={busy}
          />
        </div>

        <div className="mb-5">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
            className={inputClass}
            disabled={busy}
          />
        </div>

        {mode === "register" && (
          <div className="mb-5">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Country of residence
            </label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Costa Rica"
              className={inputClass}
              disabled={busy}
            />
          </div>
        )}

        {error && (
          <p className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          onClick={() => void submit()}
          disabled={!valid || busy}
          className="w-full rounded-full bg-slate-900 px-7 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              {mode === "signin" ? "Signing in…" : "Creating your account…"}
            </span>
          ) : mode === "signin" ? (
            "Sign in"
          ) : (
            "Create account"
          )}
        </button>
      </div>
    </div>
  );
}
