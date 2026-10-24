"use client";

import { useEffect, useRef, useState } from "react";
import { cavosConfigured } from "@/components/cavos-provider";
import { Icon } from "@/components/icon";

import { AuthForm } from "./auth-form";
import { CavosLogin } from "./cavos-login";
import { StellarWalletLogin } from "./stellar-wallet-login";

export function SignIn() {
  const card = useRef<HTMLDivElement>(null);
  const previousAlternative = useRef<"wallet" | "password" | null>(null);
  const [alternative, setAlternative] = useState<"wallet" | "password" | null>(null);
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
            <p className="login-eyebrow">Your community is waiting</p>
            <h1 tabIndex={-1}>Make yourself at home.</h1>
            <p className="login-intro">One account to discover, shop and grow with your community.</p>
            <p className="login-service-notice" role="status">Google and email sign-in are temporarily unavailable. You can still sign in with an existing account below.</p>
          </div>
        )}
      </div>
      {alternative !== null && (
        <section className="login-alternative">
          <button type="button" disabled={alternativeLocked} onClick={() => setAlternative(null)} className="login-back">← Back to {cavosConfigured ? "Google or email" : "sign-in options"}</button>
          <p className="login-eyebrow">Another way in</p>
          <h1 tabIndex={-1}>{alternative === "password" ? "Welcome back." : "Bring your wallet."}</h1>
          <p className="login-intro">{alternative === "password" ? "Use the email and password from your existing Compaki account." : "Connect the Stellar wallet you already use to access your community."}</p>
          {alternative === "password" ? <AuthForm onBusyChange={setAlternativeLocked} /> : <StellarWalletLogin onBusyChange={setAlternativeLocked} />}
        </section>
      )}
      {alternative === null && !primaryLocked && <div className="login-other">
        <button type="button" className="login-other-toggle" onClick={() => setOtherWaysOpen(!otherWaysOpen)} aria-expanded={otherWaysOpen} aria-controls="login-alternatives"><span>Other ways to sign in</span><Icon name="chevron" className={`h-3.5 w-3.5 ${otherWaysOpen ? "rotate-90" : ""}`} /></button>
        {otherWaysOpen && <div id="login-alternatives" className="login-other-options"><button type="button" onClick={() => setAlternative("wallet")}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M20 8V5H5a3 3 0 0 0 0 6h15v9H5a3 3 0 0 1-3-3V8" /><path d="M20 11h-5v5h5" /><path d="M17 13.5h.01" /></svg>Connect a wallet</button><button type="button" onClick={() => setAlternative("password")}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg>Use a password</button></div>}
      </div>}
      {!primaryLocked && alternative === null && <p className="login-new-member">{cavosConfigured ? "New here? Google or email creates your account as you go." : "You can browse every marketplace without signing in."}</p>}
    </div>
  );
}
