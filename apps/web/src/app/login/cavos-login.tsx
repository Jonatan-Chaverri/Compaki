"use client";

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
    setError(err instanceof Error ? err.message : "Something went wrong");
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
    throw new Error("Your wallet didn't open — please try again.");
  };

  const activateWallet = async () => {
    setStep("working");
    setProgress("Activating your wallet on Stellar testnet…");
    const signer = async (xdr: string) => {
      const w = latest.current.wallet;
      if (w?.chain !== "stellar") throw new Error("Your wallet isn't open");
      return w.signXdr(xdr);
    };
    const result = await followSignatures(
      await readResult(await fetch("/api/wallet/setup", { method: "POST" })),
      signer,
      () => setProgress("Approving your wallet's activation…"),
    );
    if (result.status !== 200) throw new Error(result.body.error ?? "Wallet activation failed");
    router.push(destination());
    router.refresh();
  };

  const finishSignIn = async () => {
    setStep("working");
    setProgress("Opening your wallet…");
    const current = await waitForWallet();
    if (current.walletStatus.needsDeviceApproval) {
      setStep("device");
      setBusy(false);
      return;
    }
    const stellar = current.wallet;
    if (stellar?.chain !== "stellar" || !current.address) throw new Error("Your wallet isn't open");

    setProgress("Verifying your wallet…");
    const challenge = await readResult<{ message: string }>(
      await fetch("/api/auth/cavos/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: current.address }),
      }),
    );
    if (challenge.status !== 200) throw new Error(challenge.body.error ?? "Sign-in failed");
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
    if (login.status !== 200) throw new Error(login.body.error ?? "Sign-in failed");
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
      setError(err instanceof Error ? err.message : "We couldn't send the code");
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
      if (res.status !== 200) throw new Error(res.body.error ?? "Could not save your profile");
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
      <p className="login-eyebrow">{step === "code" ? "You’re one step away" : step === "profile" ? "A quick introduction" : "Your community is waiting"}</p>
      <h1 tabIndex={-1}>{step === "code" ? "Check your inbox." : step === "profile" ? "Let’s make it yours." : step === "working" ? "Making you at home…" : step === "device" ? "One quick check." : "Make yourself at home."}</h1>
      <p className="login-intro">
        {step === "profile" ? "Tell us your name and where you’re based. You only need to do this once." : step === "code" ? <>Enter the sign-in code sent to <strong>{email}</strong>.</> : step === "working" ? "We’re getting your account ready. Keep this page open for a moment." : step === "device" ? "Approve this browser to securely access your account." : "Sign in or get started. Your next good find is waiting."}
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
            Continue with Google
          </button>
          <div className="login-divider"><span />or continue with email<span /></div>
          <div className="login-field"><label htmlFor="cavos-email">Your email</label><input id="cavos-email" autoComplete="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputClass} disabled={busy} aria-describedby="login-email-hint" /></div>
        </>}
        {step === "code" && <>
          <div className="login-field"><label htmlFor="cavos-code">Sign-in code</label><input id="cavos-code" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter your code" className={`${inputClass} login-code-input`} disabled={busy} aria-describedby="login-code-hint" /></div>
          <p id="login-code-hint" className="login-field-hint">Look for an email from no-reply@cavos.xyz. The code expires in 5 minutes.</p>
        </>}
        {step === "profile" && <>
          <div className="login-field"><label htmlFor="cavos-name">Your name</label><input id="cavos-name" autoComplete="name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ana Retana" className={inputClass} disabled={busy} /></div>
          <div className="login-field"><label htmlFor="cavos-country">Country of residence</label><input id="cavos-country" autoComplete="country-name" required minLength={2} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Costa Rica" className={inputClass} disabled={busy} /></div>
        </>}
        {step === "device" && <div className="login-service-notice"><p>This account is already connected to a wallet. Approve this device to continue.</p><button type="button" onClick={() => void submitDevice()} disabled={busy} className="login-submit mt-4">{busy ? "Approving device…" : "Approve this device"}</button></div>}
        {step === "working" && <p role="status" className="login-progress"><span className="login-spinner" />{progress}</p>}
        {error && <p role="alert" className="login-error">{error}</p>}
        {(step === "email" || step === "code" || step === "profile") && <button type="submit" disabled={busy || (step === "code" && code.trim().length < 6) || (step === "profile" && (name.trim().length < 2 || country.trim().length < 2))} className="login-submit">{busy ? <><span className="login-spinner" />One moment…</> : <>{step === "email" ? "Continue with email" : step === "code" ? "Verify & continue" : "Let’s get started"}<span aria-hidden="true">→</span></>}</button>}
        {step === "email" && <p id="login-email-hint" className="login-field-hint login-hint-centered">We’ll email you a sign-in code. No password needed.</p>}
        {step === "code" && <button type="button" onClick={startOver} disabled={busy} className="login-change-email">← Use a different email</button>}
      </form>
      <details className="login-account-details"><summary>How your account works</summary><p>Your payment wallet is created by Cavos. Compaki never holds its key. You approve payments and reward collections from your browser. This demo uses test funds only.</p></details>
    </section>
  );
}
