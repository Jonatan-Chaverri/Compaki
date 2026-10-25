"use client";
import { localizedMessage } from "@/i18n/errors";

import { useTranslations } from "next-intl";

// Password sign-in for existing accounts (demo/seeded accounts and accounts
// created before Cavos). New accounts are created with email sign-in (Cavos).
// ?next=/some/path returns the user to where they were after auth.

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500";

export function AuthForm({ onBusyChange }: { onBusyChange?: (busy: boolean) => void }) {
  const t = useTranslations("ui");

  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);

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
      if (!res.ok) throw new Error(localizedMessage(data.error, t, t("somethingWentWrong")));
      router.push(next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch (err) {
      setError(localizedMessage(err, t, t("somethingWentWrong")));
      setBusy(false);
    }
  };

  return (
    <form
      className="login-password-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && !busy) void submit();
      }}
    >
      <div className="login-field">
        <label htmlFor="auth-email" className="mb-1.5 block text-sm font-medium text-slate-700">{t("emailAddress")}</label>
        <input
          id="auth-email"
          autoComplete="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("emailPlaceholder")}
          className={inputClass}
          disabled={busy}
        />
      </div>
      <div className="login-field">
        <label htmlFor="auth-password" className="mb-1.5 block text-sm font-medium text-slate-700">{t("password")}</label>
        <div className="login-password-input"><input
          id="auth-password"
          autoComplete="current-password"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("yourPassword")}
          className={inputClass}
          disabled={busy}
        /><button type="button" onClick={() => setShowPassword(!showPassword)} disabled={busy} aria-label={showPassword ? t("hidePassword") : t("showPassword")} aria-pressed={showPassword}>{showPassword ? t("hide") : t("show")}</button></div>
      </div>
      {error && (
        <p role="alert" className="login-error">
          {localizedMessage(error, t, error)}
        </p>
      )}
      <button
        type="submit"
        disabled={!valid || busy}
        className="login-submit"
      >
        {busy ? t("signingIn") : t("signInWithPassword")}
      </button>
    </form>
  );
}
