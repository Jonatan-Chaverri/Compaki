"use client";
import { localizedMessage } from "@/i18n/errors";

import { useTranslations } from "next-intl";

// Sign-in with Cavos — "Continue with Google" or an emailed code. Either way
// Cavos opens the user's own Stellar wallet (derived from the login; its key
// never reaches Compaki). Google leaves the page and comes back to /login,
// where the provider finishes the login and we pick up from step 1. Then:
//   1. the wallet signs a one-time challenge → POST /api/auth/cavos (session),
//   2. first login only: name + country,
//   3. wallet activation (testnet XLM + demo-money trustline), signed by the
//      wallet → /api/wallet/setup + /api/tx/:id.

import { CavosAuth } from "@cavos/kit";
import { useCavos } from "@cavos/kit/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CAVOS_APP_ID } from "@/components/cavos-provider";
import { bytesToHex, followSignatures, readResult } from "@/lib/wallet-signing";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500";

type Step = "email" | "code" | "working" | "device" | "profile";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Survive the round trip to Google (the callback returns to /login without
// our query string).
const OAUTH_PENDING_KEY = "compaki:oauth-pending";
const NEXT_KEY = "compaki:login-next";

function readAndClear(key: string): string | null {
  try {
    const value = window.sessionStorage.getItem(key);
    window.sessionStorage.removeItem(key);
    return value;
  } catch {
    return null;
  }
}

export function CavosLogin({ onProgressChange }: { onProgressChange?: (active: boolean) => void }) {
  const t = useTranslations("ui");

  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const { sendOtp, verifyOtp, login, wallet, address, walletStatus, user, authError, authorizeDevice, logout } =
    useCavos();

  // The async sign-in below waits for the wallet the provider opens after the
  // code is verified (or after the Google callback); it reads the latest
  // values through this ref.
  const latest = useRef({ wallet, address, walletStatus, user, authError });
  useEffect(() => {
    latest.current = { wallet, address, walletStatus, user, authError };
  });

  const destination = () => {
    const target = searchParams.get("next") ?? readAndClear(NEXT_KEY) ?? "/";
    return target.startsWith("/") ? target : "/";
  };

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onProgressChange?.(busy || step !== "email");
  }, [busy, step, onProgressChange]);

  const fail = (err: unknown, back: Step) => {
    setError(localizedMessage(err, t, t("somethingWentWrong")));
    setStep(back);
    setBusy(false);
  };

  const waitForWallet = async () => {
    for (let i = 0; i < 120; i++) {
      const current = latest.current;
      if (current.wallet?.chain === "stellar" && current.address) return current;
      if (current.authError) throw new Error(current.authError);
      await sleep(500);
    }
    throw new Error(t("yourWalletDidnTOpenPleaseTryAgain"));
  };

  const activateWallet = async () => {
    setStep("working");
    setProgress(t("activatingYourWalletOnStellarTestnet"));
    const signer = async (xdr: string) => {
      const w = latest.current.wallet;
      if (w?.chain !== "stellar") throw new Error(t("yourWalletIsnTOpen"));
      return w.signXdr(xdr);
    };
    const result = await followSignatures(
      await readResult(await fetch("/api/wallet/setup", { method: "POST" })),
      signer,
      () => setProgress(t("approvingYourWalletSActivation")),
    );
    if (result.status !== 200) throw new Error(localizedMessage(result.body.error, t, t("walletActivationFailed")));
    router.push(destination());
    router.refresh();
  };

  const finishSignIn = async () => {
    setStep("working");
    setProgress(t("openingYourWallet"));
    const current = await waitForWallet();
    if (current.walletStatus.needsDeviceApproval) {
      setStep("device");
      setBusy(false);
      return;
    }
    const stellar = current.wallet;
    if (stellar?.chain !== "stellar" || !current.address) throw new Error(t("yourWalletIsnTOpen"));

    setProgress(t("verifyingYourWallet"));
    const challenge = await readResult<{ message: string }>(
      await fetch("/api/auth/cavos/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: current.address }),
      }),
    );
    if (challenge.status !== 200) throw new Error(localizedMessage(challenge.body.error, t, t("signInFailed")));
    const signed = await stellar.signMessage(challenge.body.message);
    const login = await readResult<{ needsProfile: boolean; walletReady: boolean }>(
      await fetch("/api/auth/cavos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: current.address,
          publicKey: signed.publicKey,
          signature: bytesToHex(signed.signature),
          message: challenge.body.message,
          email: email || latest.current.user?.email || "",
          // Cavos' signed login token (email code or Google); the API trusts
          // the email only if it verifies.
          emailToken: new CavosAuth({ appId: CAVOS_APP_ID }).getAuthToken(),
        }),
      }),
    );
    if (login.status !== 200) throw new Error(localizedMessage(login.body.error, t, t("signInFailed")));
    if (login.body.needsProfile) {
      setStep("profile");
      setBusy(false);
      return;
    }
    if (login.body.walletReady) {
      router.push(destination());
      router.refresh();
      return;
    }
    await activateWallet();
  };

  const startGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      window.sessionStorage.setItem(NEXT_KEY, next);
      window.sessionStorage.setItem(OAUTH_PENDING_KEY, "google");
      await login("google"); // navigates away to Google
    } catch (err) {
      readAndClear(OAUTH_PENDING_KEY);
      fail(err, "email");
    }
  };

  // Back from Google: the provider exchanges the callback code and opens the
  // wallet; continue the sign-in from there.
  useEffect(() => {
    if (readAndClear(OAUTH_PENDING_KEY) !== "google") return;
    let cancelled = false;
    const resume = async () => {
      await sleep(0);
      if (cancelled) return;
      setBusy(true);
      try {
        await finishSignIn();
      } catch (err) {
        fail(err, "email");
      }
    };
    void resume();
    return () => {
      cancelled = true;
    };
    // Runs once on mount, right after the redirect back to /login.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitEmail = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendOtp(email.trim());
      setStep("code");
    } catch (err) {
      setError(localizedMessage(err, t, t("weCouldnTSendTheCode")));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await verifyOtp(email.trim(), code.trim());
      await finishSignIn();
    } catch (err) {
      fail(err, "code");
    }
  };

  const submitDevice = async () => {
    setBusy(true);
    setError(null);
    try {
      await authorizeDevice();
      await finishSignIn();
    } catch (err) {
      fail(err, "device");
    }
  };

  const submitProfile = async () => {
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
      await activateWallet();
    } catch (err) {
      fail(err, "profile");
    }
  };

  const startOver = () => {
    logout();
    setStep("email");
    setCode("");
    setError(null);
  };

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  return (
    <section className="login-primary">
      <p className="login-eyebrow">{step === "code" ? t("youReOneStepAway") : step === "profile" ? t("aQuickIntroduction") : t("yourCommunityIsWaiting")}</p>
      <h1 tabIndex={-1}>{step === "code" ? t("checkYourInbox") : step === "profile" ? t("letSMakeItYours") : step === "working" ? t("makingYouAtHome") : step === "device" ? t("oneQuickCheck") : t("makeYourselfAtHome")}</h1>
      <p className="login-intro">
        {step === "profile" ? t("tellUsYourNameAndWhereYouReBasedYouOnly") : step === "code" ? <>{t("enterTheSignInCodeSentTo")}{" "}<strong>{email}</strong>.</> : step === "working" ? t("weReGettingYourAccountReadyKeepThisPageOpenFor") : step === "device" ? t("approveThisBrowserToSecurelyAccessYourAccount") : t("signInOrGetStartedYourNextGoodFindIsWaiting")}
      </p>
      <form className="login-primary-fields" onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        if (step === "email" && emailValid) void submitEmail();
        if (step === "code" && code.trim().length >= 6) void submitCode();
        if (step === "profile" && name.trim().length >= 2 && country.trim().length >= 2) void submitProfile();
      }}>
        {step === "email" && <>
          <button type="button" onClick={() => void startGoogle()} disabled={busy} className="login-google">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
              <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
              <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
              <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
            </svg>
            {t("continueWithGoogle")}</button>
          <div className="login-divider"><span />{t("orContinueWithEmail")}<span /></div>
          <div className="login-field"><label htmlFor="cavos-email">{t("yourEmail")}</label><input id="cavos-email" autoComplete="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputClass} disabled={busy} aria-describedby="login-email-hint" /></div>
        </>}
        {step === "code" && <>
          <div className="login-field"><label htmlFor="cavos-code">{t("signInCode")}</label><input id="cavos-code" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("enterYourCode")} className={`${inputClass} login-code-input`} disabled={busy} aria-describedby="login-code-hint" /></div>
          <p id="login-code-hint" className="login-field-hint">{t("lookForAnEmailFromNoReplyCavosXyzTheCode")}</p>
        </>}
        {step === "profile" && <>
          <div className="login-field"><label htmlFor="cavos-name">{t("yourName")}</label><input id="cavos-name" autoComplete="name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("anaRetana")} className={inputClass} disabled={busy} /></div>
          <div className="login-field"><label htmlFor="cavos-country">{t("countryOfResidence")}</label><input id="cavos-country" autoComplete="country-name" required minLength={2} value={country} onChange={(e) => setCountry(e.target.value)} placeholder={t("costaRica")} className={inputClass} disabled={busy} /></div>
        </>}
        {step === "device" && <div className="login-service-notice"><p>{t("thisAccountIsAlreadyConnectedToAWalletApproveThisDevice")}</p><button type="button" onClick={() => void submitDevice()} disabled={busy} className="login-submit mt-4">{busy ? t("approvingDevice") : t("approveThisDevice")}</button></div>}
        {step === "working" && <p role="status" className="login-progress"><span className="login-spinner" />{progress}</p>}
        {error && <p role="alert" className="login-error">{localizedMessage(error, t, error)}</p>}
        {(step === "email" || step === "code" || step === "profile") && <button type="submit" disabled={busy || (step === "code" && code.trim().length < 6) || (step === "profile" && (name.trim().length < 2 || country.trim().length < 2))} className="login-submit">{busy ? <><span className="login-spinner" />{t("oneMoment")}</> : <>{step === "email" ? t("continueWithEmail") : step === "code" ? t("verifyContinue") : t("letSGetStarted")}<span aria-hidden="true">→</span></>}</button>}
        {step === "email" && <p id="login-email-hint" className="login-field-hint login-hint-centered">{t("weLlEmailYouASignInCodeNoPasswordNeeded")}</p>}
        {step === "code" && <button type="button" onClick={startOver} disabled={busy} className="login-change-email">{t("useADifferentEmail")}</button>}
      </form>
      <details className="login-account-details"><summary>{t("howYourAccountWorks")}</summary><p>{t("yourPaymentWalletIsCreatedByCavosCompakiNeverHoldsIts")}</p></details>
    </section>
  );
}
