"use client";

// Email sign-in with Cavos. Cavos emails a code, verifies it, and opens the
// user's own Stellar wallet (derived from the login; its key never reaches
// Compaki). Then:
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

export function CavosLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const { sendOtp, verifyOtp, wallet, address, walletStatus, authorizeDevice, logout } = useCavos();

  // The async sign-in below waits for the wallet the provider opens after the
  // code is verified; it reads the latest values through this ref.
  const latest = useRef({ wallet, address, walletStatus });
  useEffect(() => {
    latest.current = { wallet, address, walletStatus };
  });

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fail = (err: unknown, back: Step) => {
    setError(err instanceof Error ? err.message : "Something went wrong");
    setStep(back);
    setBusy(false);
  };

  const waitForWallet = async () => {
    for (let i = 0; i < 120; i++) {
      const current = latest.current;
      if (current.wallet?.chain === "stellar" && current.address) return current;
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
    router.push(next.startsWith("/") ? next : "/");
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
          email,
          // Cavos' signed email proof; the API trusts the email only if it verifies.
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
      router.push(next.startsWith("/") ? next : "/");
      router.refresh();
      return;
    }
    await activateWallet();
  };

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
    <div className="auth-form">
      <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900">
        {step === "profile" ? "Tell us about you" : "Sign in with your email"}
      </h1>
      <p className="mt-2 text-center text-sm text-slate-500">
        {step === "profile"
          ? "Just once — this is how vendors and communities will see you."
          : "No password. We email you a code and open your own wallet."}
      </p>

      <form
        className="auth-fields mt-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          if (step === "email" && emailValid) void submitEmail();
          if (step === "code" && code.trim().length >= 6) void submitCode();
          if (step === "profile" && name.trim().length >= 2 && country.trim().length >= 2) void submitProfile();
        }}
      >
        {(step === "email" || step === "code") && (
          <div className="mb-5">
            <label htmlFor="cavos-email" className="mb-1.5 block text-sm font-medium text-slate-700">Email address</label>
            <input
              id="cavos-email"
              autoComplete="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ana@example.com"
              className={inputClass}
              disabled={busy || step === "code"}
            />
          </div>
        )}

        {step === "code" && (
          <div className="mb-5">
            <label htmlFor="cavos-code" className="mb-1.5 block text-sm font-medium text-slate-700">
              Code from your email
            </label>
            <input
              id="cavos-code"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="9-character code"
              className={`${inputClass} font-mono tracking-widest`}
              disabled={busy}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Sent by no-reply@cavos.xyz — it expires in 5 minutes.{" "}
              <button type="button" onClick={startOver} className="font-medium underline underline-offset-2">
                Use another email
              </button>
            </p>
          </div>
        )}

        {step === "profile" && (
          <>
            <div className="mb-5">
              <label htmlFor="cavos-name" className="mb-1.5 block text-sm font-medium text-slate-700">Your name</label>
              <input id="cavos-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ana Retana" className={inputClass} disabled={busy} />
            </div>
            <div className="mb-5">
              <label htmlFor="cavos-country" className="mb-1.5 block text-sm font-medium text-slate-700">Country of residence</label>
              <input id="cavos-country" autoComplete="country-name" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Costa Rica" className={inputClass} disabled={busy} />
            </div>
          </>
        )}

        {step === "device" && (
          <div className="mb-5 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
            Your wallet already exists but this browser isn&apos;t authorized to use it yet.
            <button
              type="button"
              onClick={() => void submitDevice()}
              disabled={busy}
              className="mt-3 block w-full rounded-full bg-navy-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-40"
            >
              Authorize this device
            </button>
          </div>
        )}

        {step === "working" && (
          <p role="status" className="mb-5 flex items-center gap-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-navy-900" />
            {progress}
          </p>
        )}

        {error && (
          <p role="alert" className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">
            {error}
          </p>
        )}

        {(step === "email" || step === "code" || step === "profile") && (
          <button
            type="submit"
            disabled={
              busy ||
              (step === "email" && !emailValid) ||
              (step === "code" && code.trim().length < 6) ||
              (step === "profile" && (name.trim().length < 2 || country.trim().length < 2))
            }
            className="w-full rounded-full bg-navy-900 px-7 py-3 text-sm font-medium text-white transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "One moment…" : step === "email" ? "Email me a code" : step === "code" ? "Sign in" : "Continue"}
          </button>
        )}
      </form>
      <p className="mt-5 text-xs leading-relaxed text-slate-500">
        Your wallet is created by Cavos and stays yours: Compaki never holds its key. You approve
        every payment and claim from this browser. Testnet demo money only.
      </p>
    </div>
  );
}
