"use client";
import { localizedMessage } from "@/i18n/errors";

import { useLocale } from "next-intl";

import { useTranslations } from "next-intl";

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
  provider: "own" | "none";
  address: string | null;
  walletAddress: string | null;
  walletProvider: "cavos" | "stellar-wallet" | null;
  walletReady: boolean;
  balanceUsd: number | null;
  assetCode: string;
}

export function ProfileView({ user }: { user: ProfileUser }) {
  const locale = useLocale();

  const t = useTranslations("ui");

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
        if (!res.ok) throw new Error(t("weCouldnTLoadYourBalancePleaseTryAgain"));
        if (!cancelled) {
          setWallet(body);
          setWalletError(null);
        }
      } catch {
        if (!cancelled) setWalletError(t("weCouldnTLoadYourBalancePleaseTryAgain"));
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [version, t]);

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
      if (result.status !== 200) throw new Error(t("weCouldnTFinishSettingUpPaymentsPleaseTryAgain"));
      setVersion((v) => v + 1);
    } catch {
      setWalletError(t("paymentSetupWasnTCompletedPleaseTryAgainWhenYouRe"));
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
      if (res.status === 429) throw new Error(t("pleaseWaitAFewSecondsBeforeAddingMoreDemoFunds"));
      if (res.status === 401) throw new Error(t("pleaseSignInAgainToAddDemoFunds"));
      if (res.body.code === "WALLET_SETUP") throw new Error(t("setUpPaymentsBeforeAddingDemoFunds"));
      if (res.status === 409) throw new Error(t("yourAccountCanTReceiveMoreDemoFundsRightNowRefresh"));
      if (res.status !== 200) throw new Error(t("weCouldnTAddDemoFundsPleaseTryAgain"));
      setMintResult({ ok: true, message: t("valueInDemoFundsAdded", { value1: formatAmount(res.body.amountUsd, locale) }), txHash: res.body.txHash });
      setWallet((w) => (w ? { ...w, balanceUsd: res.body.balanceUsd } : w));
    } catch (err) {
      setMintResult({ ok: false, message: localizedMessage(err, t, t("weCouldnTAddDemoFundsPleaseTryAgain")) });
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
      if (res.status !== 200) throw new Error(localizedMessage(res.body.error, t, t("couldNotSaveYourName")));
      setSaveState({ ok: true, message: t("yourNameHasBeenUpdated") });
      router.refresh();
    } catch (err) {
      setSaveState({ ok: false, message: localizedMessage(err, t, t("couldNotSaveYourName")) });
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
  const locale = useLocale();

  const t = useTranslations("ui");

const ACCESS_LABELS = {
  cavos: { title: t("personalAccountCavos"), detail: t("youApproveEachPaymentAndRewardCollectionFromYourBrowser") },
  "stellar-wallet": { title: t("connectedAccount"), detail: t("paymentsAndRewardCollectionsNeedYourApprovalInTheAppYou") },
  none: { title: t("notSetUpYet"), detail: t("yourPaymentAccountWillBeSetUpWhenYouBuySell") },
};

  const { wallet, error, refreshing, activating, minting, mintResult, copyState } = account;
  const { name, saving, saveState } = personalDetails;
  const needsActivation = wallet !== null && wallet.walletAddress !== null && !wallet.walletReady;
  const canTopUp = wallet !== null && wallet.provider !== "none" && !needsActivation;
  const nameChanged = name.trim() !== user.name && name.trim().length >= 2;
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const access = wallet ? ACCESS_LABELS[wallet.provider === "own" ? wallet.walletProvider ?? "cavos" : wallet.provider] : null;
  const country = user.country && /^[A-Za-z]{2}$/.test(user.country)
    ? new Intl.DisplayNames([locale], { type: "region" }).of(user.country.toUpperCase()) ?? user.country
    : user.country;

  return (
    <div className="profile-content">
      <section className="profile-welcome" aria-label={t("yourProfileOverview")}>
        <div className="profile-avatar" aria-hidden="true">{initials || "C"}</div>
        <div className="profile-identity">
          <p className="eyebrow">{t("aLittleMoreYou")}</p>
          <h2>{user.name}</h2>
          <p>{country || t("partOfTheCompakiCommunity")}<span aria-hidden="true"> · </span>{t("compakiMember")}</p>
        </div>
        <span className="profile-welcome-note"><Icon name="leaf" className="h-5 w-5" />{t("goodToHaveYouHere")}</span>
      </section>

      <div className="profile-main-grid">
        <section className="profile-personal profile-panel" aria-labelledby="profile-personal-title">
          <div className="profile-section-heading"><span className="profile-section-icon"><Icon name="people" /></span><div><h2 id="profile-personal-title">{t("personalDetails")}</h2><p>{t("aFamiliarFaceInEveryMarketplace")}</p></div></div>
          <form onSubmit={(event) => { event.preventDefault(); if (nameChanged && !saving) void personalDetails.onSave(); }}>
            <label htmlFor="profile-name">{t("yourName")}</label>
            <input id="profile-name" autoComplete="name" value={name} required minLength={2} maxLength={60}
              onChange={(event) => personalDetails.onNameChange(event.target.value)} disabled={saving} aria-describedby="profile-name-hint" />
            <p id="profile-name-hint" className="profile-field-hint">{t("thisIsTheNameSellersAndCommunitiesWillSee")}</p>
            <dl className="profile-personal-facts">
              <div><dt>{t("emailAddress")}</dt><dd>{user.email || t("noEmailLinked")}</dd></div>
              <div><dt>{t("country")}</dt><dd>{country || t("notAddedYet")}</dd></div>
            </dl>
            <div className="profile-save-row"><button type="submit" className="button-primary button-small" disabled={!nameChanged || saving}>{saving ? t("saving") : t("saveChanges")}</button><span>{t("yourProfileWorksAcrossCompaki")}</span></div>
            {saveState && <p role="status" className={`profile-feedback ${saveState.ok ? "" : "profile-feedback-error"}`}>{localizedMessage(saveState.message, t, saveState.message)}</p>}
          </form>
        </section>

        <section className="profile-balance" aria-labelledby="profile-balance-title">
          <div className="profile-balance-top"><h2 id="profile-balance-title">{t("yourBalance")}</h2><span>{t("demoFunds")}</span></div>
          <p className="profile-balance-amount" aria-live="polite" aria-busy={refreshing}>{wallet?.balanceUsd != null ? formatAmount(wallet.balanceUsd, locale) : refreshing ? "—" : wallet?.provider === "none" ? t("notSetUpYet") : t("unavailable")}</p>
          <p className="profile-balance-description">{needsActivation ? t("oneQuickStepToStartExploringPayments") : wallet?.provider === "none" ? t("yourBalanceWillAppearWhenYourPaymentAccountIsSetUp") : t("forPurchasesInCompakiMarketplaces")}</p>
          {needsActivation ? <button type="button" className="profile-balance-action" onClick={() => void account.onActivate()} disabled={activating || refreshing}>{activating ? t("waitingForYourApproval") : t("setUpPayments")}<Icon name="arrow" className="h-4 w-4" /></button>
            : canTopUp ? <button type="button" className="profile-balance-action" onClick={() => void account.onTopUp()} disabled={minting || refreshing}>{minting ? t("addingDemoFunds") : t("add20InDemoFunds")}<span aria-hidden="true">+</span></button> : null}
          <div className="profile-balance-footer"><span><Icon name="spark" className="h-3.5 w-3.5" />{t("forTryingThingsOutNoRealMoney")}</span><button type="button" disabled={refreshing || minting || activating} onClick={account.onRefresh} aria-label={t("refreshBalance")}>{refreshing ? t("updating") : t("refresh")}</button></div>
          {mintResult && <p role={mintResult.ok ? "status" : "alert"} className="profile-balance-message">{localizedMessage(mintResult.message, t, mintResult.message)}{mintResult.txHash && <> <a href={txUrl(mintResult.txHash)} target="_blank" rel="noopener noreferrer">{t("viewReceipt")}</a></>}</p>}
          {error && <p role="alert" className="profile-balance-message">{localizedMessage(error, t, error)}</p>}
        </section>
      </div>

      <nav className="profile-shortcuts" aria-label={t("yourCompakiActivity")}>
        <Link href="/orders"><span className="profile-shortcut-icon"><Icon name="bag" /></span><div><h2>{t("myOrders")}</h2><p>{t("yourPurchasesAllInOnePlace")}</p></div><Icon name="chevron" className="h-4 w-4" /></Link>
        <Link href="/rewards"><span className="profile-shortcut-icon"><Icon name="heart" /></span><div><h2>{t("myRewards")}</h2><p>{t("seeWhatYourCommunityShares")}</p></div><Icon name="chevron" className="h-4 w-4" /></Link>
        <Link href="/marketplaces"><span className="profile-shortcut-icon"><Icon name="store" /></span><div><h2>{t("exploreMarketplaces")}</h2><p>{t("findYourNextLocalFavorite")}</p></div><Icon name="chevron" className="h-4 w-4" /></Link>
      </nav>

      <details className="profile-account-details">
        <summary><span className="profile-details-icon"><Icon name="shield" className="h-4 w-4" /></span><span><strong>{t("accountDetails")}</strong><small>{t("paymentInformationAccountReference")}</small></span><Icon name="chevron" className="profile-details-chevron h-4 w-4" /></summary>
        <div className="profile-details-body">
          <p>{t("yourAccountReferenceLetsYouLookUpPaymentActivityAndIdentify")}</p>
          <dl className="profile-technical-facts">
            <div className="profile-address"><dt>{t("accountAddress")}</dt><dd>{wallet?.address ? <><code>{wallet.address}</code><div className="profile-address-actions"><button type="button" onClick={() => void account.onCopy()}>{copyState === "copied" ? t("copied") : t("copyAddress")}</button><a href={`https://stellar.expert/explorer/testnet/account/${wallet.address}`} target="_blank" rel="noopener noreferrer">{t("viewActivity")}</a></div><span role="status">{copyState === "copied" ? t("addressCopiedToClipboard") : copyState === "error" ? t("couldnTCopySelectTheAddressAboveToCopyItManually") : ""}</span></> : refreshing ? t("loading") : error ? t("couldNotLoadAccountDetailsTryRefreshingYourBalance") : t("availableOnceYourPaymentAccountIsSetUp")}</dd></div>
            <div><dt>{t("currency")}</dt><dd>{wallet?.assetCode || "—"}<small>{t("demoAssetNotIssuedByCircle")}</small></dd></div>
            <div><dt>{t("network")}</dt><dd>{t("stellarTestnet")}<small>{t("aTestingEnvironment")}</small></dd></div>
            {access && <div className="profile-account-access"><dt>{t("accountAccess")}</dt><dd>{access.title}<small>{access.detail}</small></dd></div>}
          </dl>
        </div>
      </details>
    </div>
  );
}
