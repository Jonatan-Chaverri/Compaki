"use client";
import { useTranslations } from "next-intl";

import { useEffect, useRef, useState } from "react";
import { cavosConfigured } from "@/components/cavos-provider";
import { Icon } from "@/components/icon";

import { CavosLogin } from "./cavos-login";
import { StellarWalletLogin } from "./stellar-wallet-login";

export function SignIn() {
  const t = useTranslations("ui");

  const card = useRef<HTMLDivElement>(null);
  const previousAlternative = useRef<"wallet" | null>(null);
  const [alternative, setAlternative] = useState<"wallet" | null>(null);
  const [primaryLocked, setPrimaryLocked] = useState(false);
  const [alternativeLocked, setAlternativeLocked] = useState(false);
  const [otherWaysOpen, setOtherWaysOpen] = useState(!cavosConfigured);

  useEffect(() => {
    if (alternative !== previousAlternative.current) {
      const heading = card.current?.querySelector<HTMLElement>(alternative ? ".login-alternative h1" : ".login-primary h1");
      heading?.focus();
      previousAlternative.current = alternative;
    }
  }, [alternative]);

  return (
    <div className="login-card" ref={card}>
      <div hidden={alternative !== null}>
        {cavosConfigured ? <CavosLogin onProgressChange={setPrimaryLocked} /> : (
          <div className="login-primary">
            <p className="login-eyebrow">{t("yourCommunityIsWaiting")}</p>
            <h1 tabIndex={-1}>{t("makeYourselfAtHome")}</h1>
            <p className="login-intro">{t("oneAccountToDiscoverShopAndGrowWithYourCommunity")}</p>
            <p className="login-service-notice" role="status">{t("googleAndEmailSignInAreTemporarilyUnavailableYouCanStill")}</p>
          </div>
        )}
      </div>
      {alternative !== null && (
        <section className="login-alternative">
          <button type="button" disabled={alternativeLocked} onClick={() => setAlternative(null)} className="login-back">{t("backTo")}{" "}{cavosConfigured ? t("googleOrEmail") : t("signInOptions")}</button>
          <p className="login-eyebrow">{t("anotherWayIn")}</p>
          <h1 tabIndex={-1}>{t("bringYourWallet")}</h1>
          <p className="login-intro">{t("connectTheStellarWalletYouAlreadyUseToAccessYourCommunity")}</p>
          <StellarWalletLogin onBusyChange={setAlternativeLocked} />
        </section>
      )}
      {alternative === null && !primaryLocked && <div className="login-other">
        <button type="button" className="login-other-toggle" onClick={() => setOtherWaysOpen(!otherWaysOpen)} aria-expanded={otherWaysOpen} aria-controls="login-alternatives"><span>{t("otherWaysToSignIn")}</span><Icon name="chevron" className={`h-3.5 w-3.5 ${otherWaysOpen ? "rotate-90" : ""}`} /></button>
        {otherWaysOpen && <div id="login-alternatives" className="login-other-options"><button type="button" onClick={() => setAlternative("wallet")}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M20 8V5H5a3 3 0 0 0 0 6h15v9H5a3 3 0 0 1-3-3V8" /><path d="M20 11h-5v5h5" /><path d="M17 13.5h.01" /></svg>{t("connectAWallet")}</button></div>}
      </div>}
      {!primaryLocked && alternative === null && <p className="login-new-member">{cavosConfigured ? t("newHereGoogleOrEmailCreatesYourAccountAsYouGo") : t("youCanBrowseEveryMarketplaceWithoutSigningIn")}</p>}
    </div>
  );
}
