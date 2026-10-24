"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useCompakiWallet } from "@/components/cavos-provider";
import { Icon } from "@/components/icon";
import { formatAmount, txUrl } from "@/lib/rewards";
import { followSignatures, readResult } from "@/lib/wallet-signing";

export interface ProfileUser {
  id: string;
  name: string;
  email: string | null;
  country: string | null;
}

export interface WalletInfo {
  provider: "own" | "custodial" | "none";
  address: string | null;
  walletAddress: string | null;
  walletProvider: "cavos" | "stellar-wallet" | null;
  walletReady: boolean;
  balanceUsd: number | null;
  assetCode: string;
}

const ACCESS_LABELS = {
  cavos: { title: "Personal account · Cavos", detail: "You approve each payment and reward collection from your browser." },
  "stellar-wallet": { title: "Connected account", detail: "Payments and reward collections need your approval in the app you connected." },
  custodial: { title: "Managed by Compaki", detail: "Compaki manages the keys and approves payments for this older account type." },
  none: { title: "Not set up yet", detail: "Your payment account will be set up when you buy, sell or receive a reward." },
};

export function ProfileView({ user }: { user: ProfileUser }) {
  const router = useRouter();
  const signer = useCompakiWallet();

  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [refreshing, setRefreshing] = useState(true);
  const [activating, setActivating] = useState(false);
  const [minting, setMinting] = useState(false);
  const [mintResult, setMintResult] = useState<{ ok: boolean; message: string; txHash?: string } | null>(null);

  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setRefreshing(true);
      try {
        const res = await fetch("/api/wallet", { cache: "no-store" });
        const body = (await res.json()) as WalletInfo & { error?: string };
        if (!res.ok) throw new Error("We couldn’t load your balance. Please try again.");
        if (!cancelled) {
          setWallet(body);
          setWalletError(null);
        }
      } catch {
        if (!cancelled) setWalletError("We couldn’t load your balance. Please try again.");
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [version]);

  const copyAddress = async () => {
    if (!wallet?.address) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2_000);
    } catch {
      setCopyState("error");
    }
  };

  const activate = async () => {
    setActivating(true);
    setWalletError(null);
    try {
      const result = await followSignatures(
        await readResult(await fetch("/api/wallet/setup", { method: "POST" })),
        signer.signXdr,
      );
      if (result.status !== 200) throw new Error("We couldn’t finish setting up payments. Please try again.");
      setVersion((v) => v + 1);
    } catch {
      setWalletError("Payment setup wasn’t completed. Please try again when you’re ready to approve.");
    } finally {
      setActivating(false);
    }
  };

  const mint = async () => {
    setMinting(true);
    setMintResult(null);
    try {
      const res = await readResult<{ txHash: string; amountUsd: number; balanceUsd: number; code?: string }>(
        await fetch("/api/wallet/mint", { method: "POST" }),
      );
      if (res.status === 429) throw new Error("Please wait a few seconds before adding more demo funds.");
      if (res.status === 401) throw new Error("Please sign in again to add demo funds.");
      if (res.body.code === "WALLET_SETUP") throw new Error("Set up payments before adding demo funds.");
      if (res.status === 409) throw new Error("Your account can’t receive more demo funds right now. Refresh your balance and try again.");
      if (res.status !== 200) throw new Error("We couldn’t add demo funds. Please try again.");
      setMintResult({ ok: true, message: `${formatAmount(res.body.amountUsd)} in demo funds added.`, txHash: res.body.txHash });
      setWallet((w) => (w ? { ...w, balanceUsd: res.body.balanceUsd } : w));
    } catch (err) {
      setMintResult({ ok: false, message: err instanceof Error ? err.message : "We couldn’t add demo funds. Please try again." });
    } finally {
      setMinting(false);
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
          body: JSON.stringify({ name: name.trim() }),
        }),
      );
      if (res.status !== 200) throw new Error(res.body.error ?? "Could not save your name");
      setSaveState({ ok: true, message: "Your name has been updated." });
      router.refresh();
    } catch (err) {
      setSaveState({ ok: false, message: err instanceof Error ? err.message : "Could not save your name" });
    } finally {
      setSaving(false);
    }
  };

  return <ProfileContent user={user}
    account={{ wallet, error: walletError, refreshing, activating, minting, mintResult, copyState,
      onRefresh: () => setVersion((v) => v + 1), onActivate: activate, onTopUp: mint, onCopy: copyAddress }}
    personalDetails={{ name, saving, saveState, onNameChange: (value) => { setName(value); setSaveState(null); }, onSave: saveName }} />;
}

type ResultMessage = { ok: boolean; message: string; txHash?: string } | null;
interface ProfileContentProps {
  user: ProfileUser;
  account: {
    wallet: WalletInfo | null;
    error: string | null;
    refreshing: boolean;
    activating: boolean;
    minting: boolean;
    mintResult: ResultMessage;
    copyState: "idle" | "copied" | "error";
    onRefresh: () => void;
    onActivate: () => Promise<void>;
    onTopUp: () => Promise<void>;
    onCopy: () => Promise<void>;
  };
  personalDetails: {
    name: string;
    saving: boolean;
    saveState: ResultMessage;
    onNameChange: (name: string) => void;
    onSave: () => Promise<void>;
  };
}

/** Presentation is separate from account requests and payment approvals. */
export function ProfileContent({ user, account, personalDetails }: ProfileContentProps) {
  const { wallet, error, refreshing, activating, minting, mintResult, copyState } = account;
  const { name, saving, saveState } = personalDetails;
  const needsActivation = wallet !== null && wallet.walletAddress !== null && !wallet.walletReady;
  const canTopUp = wallet !== null && wallet.provider !== "none" && !needsActivation;
  const nameChanged = name.trim() !== user.name && name.trim().length >= 2;
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const access = wallet ? ACCESS_LABELS[wallet.provider === "own" ? wallet.walletProvider ?? "cavos" : wallet.provider] : null;
  const country = user.country && /^[A-Za-z]{2}$/.test(user.country)
    ? new Intl.DisplayNames(["en"], { type: "region" }).of(user.country.toUpperCase()) ?? user.country
    : user.country;

  return (
    <div className="profile-content">
      <section className="profile-welcome" aria-label="Your profile overview">
        <div className="profile-avatar" aria-hidden="true">{initials || "C"}</div>
        <div className="profile-identity">
          <p className="eyebrow">A little more you</p>
          <h2>{user.name}</h2>
          <p>{country || "Part of the Compaki community"}<span aria-hidden="true"> · </span>Compaki member</p>
        </div>
        <span className="profile-welcome-note"><Icon name="leaf" className="h-5 w-5" />Good to have you here.</span>
      </section>

      <div className="profile-main-grid">
        <section className="profile-personal profile-panel" aria-labelledby="profile-personal-title">
          <div className="profile-section-heading"><span className="profile-section-icon"><Icon name="people" /></span><div><h2 id="profile-personal-title">Personal details</h2><p>A familiar face in every marketplace.</p></div></div>
          <form onSubmit={(event) => { event.preventDefault(); if (nameChanged && !saving) void personalDetails.onSave(); }}>
            <label htmlFor="profile-name">Your name</label>
            <input id="profile-name" autoComplete="name" value={name} required minLength={2} maxLength={60}
              onChange={(event) => personalDetails.onNameChange(event.target.value)} disabled={saving} aria-describedby="profile-name-hint" />
            <p id="profile-name-hint" className="profile-field-hint">This is the name sellers and communities will see.</p>
            <dl className="profile-personal-facts">
              <div><dt>Email address</dt><dd>{user.email || "No email linked"}</dd></div>
              <div><dt>Country</dt><dd>{country || "Not added yet"}</dd></div>
            </dl>
            <div className="profile-save-row"><button type="submit" className="button-primary button-small" disabled={!nameChanged || saving}>{saving ? "Saving…" : "Save changes"}</button><span>Your profile works across Compaki.</span></div>
            {saveState && <p role="status" className={`profile-feedback ${saveState.ok ? "" : "profile-feedback-error"}`}>{saveState.message}</p>}
          </form>
        </section>

        <section className="profile-balance" aria-labelledby="profile-balance-title">
          <div className="profile-balance-top"><h2 id="profile-balance-title">Your balance</h2><span>Demo funds</span></div>
          <p className="profile-balance-amount" aria-live="polite" aria-busy={refreshing}>{wallet?.balanceUsd != null ? formatAmount(wallet.balanceUsd) : refreshing ? "—" : wallet?.provider === "none" ? "Not set up yet" : "Unavailable"}</p>
          <p className="profile-balance-description">{needsActivation ? "One quick step to start exploring payments." : wallet?.provider === "none" ? "Your balance will appear when your payment account is set up." : "For purchases in Compaki marketplaces."}</p>
          {needsActivation ? <button type="button" className="profile-balance-action" onClick={() => void account.onActivate()} disabled={activating || refreshing}>{activating ? "Waiting for your approval…" : "Set up payments"}<Icon name="arrow" className="h-4 w-4" /></button>
            : canTopUp ? <button type="button" className="profile-balance-action" onClick={() => void account.onTopUp()} disabled={minting || refreshing}>{minting ? "Adding demo funds…" : "Add $20 in demo funds"}<span aria-hidden="true">+</span></button> : null}
          <div className="profile-balance-footer"><span><Icon name="spark" className="h-3.5 w-3.5" />For trying things out. No real money.</span><button type="button" disabled={refreshing || minting || activating} onClick={account.onRefresh} aria-label="Refresh balance">{refreshing ? "Updating…" : "Refresh"}</button></div>
          {mintResult && <p role={mintResult.ok ? "status" : "alert"} className="profile-balance-message">{mintResult.message}{mintResult.txHash && <> <a href={txUrl(mintResult.txHash)} target="_blank" rel="noopener noreferrer">View receipt ↗</a></>}</p>}
          {error && <p role="alert" className="profile-balance-message">{error}</p>}
        </section>
      </div>

      <nav className="profile-shortcuts" aria-label="Your Compaki activity">
        <Link href="/orders"><span className="profile-shortcut-icon"><Icon name="bag" /></span><div><h2>My orders</h2><p>Your purchases, all in one place.</p></div><Icon name="chevron" className="h-4 w-4" /></Link>
        <Link href="/rewards"><span className="profile-shortcut-icon"><Icon name="heart" /></span><div><h2>My rewards</h2><p>See what your community shares.</p></div><Icon name="chevron" className="h-4 w-4" /></Link>
        <Link href="/marketplaces"><span className="profile-shortcut-icon"><Icon name="store" /></span><div><h2>Explore marketplaces</h2><p>Find your next local favorite.</p></div><Icon name="chevron" className="h-4 w-4" /></Link>
      </nav>

      <details className="profile-account-details">
        <summary><span className="profile-details-icon"><Icon name="shield" className="h-4 w-4" /></span><span><strong>Account details</strong><small>Payment information & account reference</small></span><Icon name="chevron" className="profile-details-chevron h-4 w-4" /></summary>
        <div className="profile-details-body">
          <p>Your account reference lets you look up payment activity and identify the account used for purchases and rewards.</p>
          <dl className="profile-technical-facts">
            <div className="profile-address"><dt>Account address</dt><dd>{wallet?.address ? <><code>{wallet.address}</code><div className="profile-address-actions"><button type="button" onClick={() => void account.onCopy()}>{copyState === "copied" ? "Copied ✓" : "Copy address"}</button><a href={`https://stellar.expert/explorer/testnet/account/${wallet.address}`} target="_blank" rel="noopener noreferrer">View activity ↗</a></div><span role="status">{copyState === "copied" ? "Address copied to clipboard." : copyState === "error" ? "Couldn’t copy. Select the address above to copy it manually." : ""}</span></> : refreshing ? "Loading…" : error ? "Could not load account details. Try refreshing your balance." : "Available once your payment account is set up."}</dd></div>
            <div><dt>Currency</dt><dd>{wallet?.assetCode || "—"}<small>Demo asset · not issued by Circle</small></dd></div>
            <div><dt>Network</dt><dd>Stellar testnet<small>A testing environment</small></dd></div>
            {access && <div className="profile-account-access"><dt>Account access</dt><dd>{access.title}<small>{access.detail}</small></dd></div>}
          </dl>
        </div>
      </details>
    </div>
  );
}
