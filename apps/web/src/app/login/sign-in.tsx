"use client";

// Sign-in options: Cavos (Google or email code), an existing Stellar wallet,
// and password sign-in for older/demo accounts.

import { cavosConfigured } from "@/components/cavos-provider";

import { AuthForm } from "./auth-form";
import { CavosLogin } from "./cavos-login";
import { StellarWalletLogin } from "./stellar-wallet-login";

export function SignIn() {
  return (
    <div>
      {cavosConfigured ? (
        <CavosLogin />
      ) : (
        <div className="auth-form">
          <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900">Sign in</h1>
          <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
            Email sign-in isn&apos;t configured on this server (NEXT_PUBLIC_CAVOS_APP_ID).
          </p>
        </div>
      )}
      <StellarWalletLogin />
      <details className="auth-form mt-4" open={!cavosConfigured}>
        <summary className="cursor-pointer text-sm font-medium text-slate-600">
          Have an account with a password?
        </summary>
        <AuthForm />
      </details>
    </div>
  );
}
