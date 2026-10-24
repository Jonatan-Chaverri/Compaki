"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useCompakiWallet } from "@/components/cavos-provider";
import { formatAmount } from "@/lib/rewards";
import { followSignatures, readResult } from "@/lib/wallet-signing";

export interface ProfileUser {
  id: string;
  name: string;
  email: string | null;
  country: string | null;
}

interface WalletInfo {
  provider: "cavos" | "custodial" | "none";
  address: string | null;
  cavosAddress: string | null;
  cavosReady: boolean;
  balanceUsd: number | null;
  assetCode: string;
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500";

const PROVIDER_LABEL: Record<WalletInfo["provider"], { title: string; detail: string }> = {
  cavos: {
    title: "Your own wallet (Cavos)",
    detail: "Only you can move this money: you approve every payment and claim from your browser.",
  },
  custodial: {
    title: "Managed by Compaki",
    detail: "An older account type: Compaki holds this wallet's key and signs for you.",
  },
  none: {
    title: "No wallet yet",
    detail: "Your wallet is created the first time you buy, sell or receive a reward.",
  },
};

export function ProfileView({ user }: { user: ProfileUser }) {
  const router = useRouter();
  const signer = useCompakiWallet();

  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [copied, setCopied] = useState(false);
  const [activating, setActivating] = useState(false);

  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/wallet", { cache: "no-store" });
        const body = (await res.json()) as WalletInfo & { error?: string };
        if (!res.ok) throw new Error(body.error ?? "Could not load your wallet");
        if (!cancelled) {
          setWallet(body);
          setWalletError(null);
        }
      } catch (err) {
        if (!cancelled) setWalletError(err instanceof Error ? err.message : "Could not load your wallet");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [version]);

  const copyAddress = async () => {
    if (!wallet?.address) return;
    await navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1_500);
  };

  const activate = async () => {
    setActivating(true);
    setWalletError(null);
    try {
      const result = await followSignatures(
        await readResult(await fetch("/api/wallet/setup", { method: "POST" })),
        signer?.signXdr ?? null,
      );
      if (result.status !== 200) throw new Error(result.body.error ?? "Wallet activation failed");
      setVersion((v) => v + 1);
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : "Wallet activation failed");
    } finally {
      setActivating(false);
    }
  };

  const saveName = async () => {
    setSaving(true);
    setSaveState(null);
    try {
      const res = await readResult(
        await fetch("/api/auth/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }),
      );
      if (res.status !== 200) throw new Error(res.body.error ?? "Could not save your name");
      setSaveState({ ok: true, message: "Saved." });
      router.refresh();
    } catch (err) {
      setSaveState({ ok: false, message: err instanceof Error ? err.message : "Could not save your name" });
    } finally {
      setSaving(false);
    }
  };

  const nameChanged = name.trim() !== user.name && name.trim().length >= 2;
  const needsActivation = wallet !== null && wallet.cavosAddress !== null && !wallet.cavosReady;
  const label = wallet ? PROVIDER_LABEL[wallet.provider] : null;

  return (
    <div className="mt-6 space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Balance</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
              {wallet === null
                ? "—"
                : wallet.balanceUsd === null
                  ? "Unavailable"
                  : formatAmount(wallet.balanceUsd)}
              {wallet && wallet.balanceUsd !== null && (
                <span className="ml-2 text-base font-medium text-slate-400">{wallet.assetCode}</span>
              )}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Testnet demo dollars — not real money and not Circle USDC.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setVersion((v) => v + 1)}
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>

        <div className="mt-6 border-t border-slate-100 pt-5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Wallet address</p>
          {wallet?.address ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800">
                {wallet.address}
              </code>
              <button
                type="button"
                onClick={() => void copyAddress()}
                className="rounded-full bg-navy-900 px-4 py-2 text-xs font-medium text-white hover:bg-navy-700"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
              <a
                href={`https://stellar.expert/explorer/testnet/account/${wallet.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-500 underline decoration-dotted underline-offset-2 hover:text-slate-800"
              >
                View on Stellar Explorer ↗
              </a>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">{wallet === null ? "Loading…" : "—"}</p>
          )}
          {label && (
            <p className="mt-3 text-sm text-slate-600">
              <span className="font-medium text-slate-900">{label.title}.</span> {label.detail}
            </p>
          )}
          {needsActivation && (
            <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
              Your Cavos wallet <code className="font-mono text-xs">{wallet.cavosAddress}</code> isn&apos;t
              activated yet.
              <button
                type="button"
                onClick={() => void activate()}
                disabled={activating}
                className="mt-3 block rounded-full bg-navy-900 px-5 py-2 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-40"
              >
                {activating ? "Approve in your wallet…" : "Activate my wallet"}
              </button>
            </div>
          )}
          {walletError && <p className="mt-3 text-sm text-red-600">{walletError}</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (nameChanged && !saving) void saveName();
          }}
        >
          <label htmlFor="profile-name" className="block text-xs font-medium uppercase tracking-wider text-slate-400">
            Name
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              id="profile-name"
              autoComplete="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaveState(null);
              }}
              maxLength={60}
              className={`${inputClass} min-w-0 flex-1`}
              disabled={saving}
            />
            <button
              type="submit"
              disabled={!nameChanged || saving}
              className="rounded-full bg-navy-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          {saveState && (
            <p role="status" className={`mt-2 text-sm ${saveState.ok ? "text-emerald-700" : "text-red-600"}`}>
              {saveState.message}
            </p>
          )}
        </form>
        <dl className="mt-5 grid gap-4 border-t border-slate-100 pt-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-slate-400">Email</dt>
            <dd className="mt-1 text-slate-800">{user.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-slate-400">Country</dt>
            <dd className="mt-1 text-slate-800">{user.country ?? "—"}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
