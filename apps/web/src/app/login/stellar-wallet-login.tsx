"use client";
import { localizedMessage } from "@/i18n/errors";

import { useTranslations } from "next-intl";

// Sign-in with a Stellar wallet the user already has (Freighter, xBull,
// Albedo, Lobstr…) via Stellar Wallets Kit:
//   1. pick + connect the wallet → its address,
//   2. the wallet signs a challenge transaction the API built (sequence 0, so
//      it can never be submitted) → POST /api/auth/wallet (session),
//   3. first login only: name + country,
//   4. activation on testnet (funding + demo-money trustline), signed in the
//      wallet → /api/wallet/setup + /api/tx/:id.

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { connectStellarWallet, signWithStellarWallet } from "@/lib/stellar-wallets";
import { followSignatures, readResult } from "@/lib/wallet-signing";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500";

type Step = "start" | "working" | "profile";

export function StellarWalletLogin({ onBusyChange }: { onBusyChange?: (busy: boolean) => void }) {
  const t = useTranslations("ui");

  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [step, setStep] = useState<Step>("start");
  const [address, setAddress] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { onBusyChange?.(busy || step !== "start"); }, [busy, step, onBusyChange]);

  const fail = (err: unknown, back: Step) => {
    setError(localizedMessage(err, t, t("somethingWentWrong")));
    setStep(back);
    setBusy(false);
  };

  const activateAndGo = async (account: string) => {
    setStep("working");
    setProgress(t("activatingYourWalletOnStellarTestnetApproveItInYourWallet"));
    const result = await followSignatures(
      await readResult(await fetch("/api/wallet/setup", { method: "POST" })),
      (xdr) => signWithStellarWallet(xdr, account),
    );
    if (result.status !== 200) throw new Error(localizedMessage(result.body.error, t, t("walletActivationFailed")));
    router.push(next.startsWith("/") ? next : "/");
    router.refresh();
  };

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const account = await connectStellarWallet();
      setAddress(account);
      setStep("working");
      setProgress(t("approveTheSignInRequestInYourWalletNothingIsSent"));
      const challenge = await readResult<{ xdr: string }>(
        await fetch("/api/auth/wallet/challenge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: account }),
        }),
      );
      if (challenge.status !== 200) throw new Error(localizedMessage(challenge.body.error, t, t("signInFailed")));
      const signedXdr = await signWithStellarWallet(challenge.body.xdr, account);
      const login = await readResult<{ needsProfile: boolean; walletReady: boolean }>(
        await fetch("/api/auth/wallet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: account, signedXdr }),
        }),
      );
      if (login.status !== 200) throw new Error(localizedMessage(login.body.error, t, t("signInFailed")));
      if (login.body.needsProfile) {
        setStep("profile");
        setBusy(false);
        return;
      }
      if (login.body.walletReady) {
        router.push(next.startsWith("/") ? next : "/");
        router.refresh();
        return;
      }
      await activateAndGo(account);
    } catch (err) {
      fail(err, "start");
    }
  };

  const saveProfile = async () => {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const res = await readResult(
        await fetch("/api/auth/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, country }),
        }),
      );
      if (res.status !== 200) throw new Error(localizedMessage(res.body.error, t, t("couldNotSaveYourProfile")));
      await activateAndGo(address);
    } catch (err) {
      fail(err, "profile");
    }
  };

  return (
    <div className="login-wallet-form">
      {step === "start" && (
        <>
          <p className="login-wallet-label">{t("forPeopleWithAnExistingWallet")}</p>
          <p className="mt-1 text-xs text-slate-500">
            {t("freighterXbullAlbedoLobstrAndMoreSwitchItTo")}{" "}<strong>{t("testnet")}</strong> {" "}{t("first")}</p>
          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy}
            className="login-submit mt-5"
          >
            {t("connectAStellarWallet")}</button>
        </>
      )}

      {step === "working" && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-navy-900" />
          {progress}
        </p>
      )}

      {step === "profile" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && name.trim().length >= 2 && country.trim().length >= 2) void saveProfile();
          }}
        >
          <p className="text-sm font-medium text-slate-800">{t("welcomeTellUsAboutYou")}</p>
          <p className="mt-1 break-all font-mono text-xs text-slate-400">{address}</p>
          <div className="mt-4 mb-4">
            <label htmlFor="wallet-name" className="mb-1.5 block text-sm font-medium text-slate-700">{t("yourName")}</label>
            <input id="wallet-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("anaRetana")} className={inputClass} disabled={busy} />
          </div>
          <div className="mb-4">
            <label htmlFor="wallet-country" className="mb-1.5 block text-sm font-medium text-slate-700">{t("countryOfResidence")}</label>
            <input id="wallet-country" autoComplete="country-name" value={country} onChange={(e) => setCountry(e.target.value)} placeholder={t("costaRica")} className={inputClass} disabled={busy} />
          </div>
          <button
            type="submit"
            disabled={busy || name.trim().length < 2 || country.trim().length < 2}
            className="login-submit"
          >
            {busy ? t("oneMoment") : t("continue")}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="login-error">
          {localizedMessage(error, t, error)}
        </p>
      )}
    </div>
  );
}
