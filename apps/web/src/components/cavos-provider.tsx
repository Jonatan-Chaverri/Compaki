"use client";

// Cavos: email login + the user's own Stellar wallet. Cavos derives the wallet
// from the login and keeps its key in the Cavos vault — Compaki never sees it.
// The app only asks the wallet to sign (a login challenge, and transactions
// the API prepared), through the small context below so pages work the same
// whether or not Cavos is configured (NEXT_PUBLIC_CAVOS_APP_ID).

import { CavosProvider, useCavos } from "@cavos/kit/react";
import { createContext, useContext, useMemo } from "react";

export const CAVOS_APP_ID = process.env.NEXT_PUBLIC_CAVOS_APP_ID ?? "";
export const cavosConfigured = CAVOS_APP_ID !== "";

/** Changing it changes every user's derived wallet address — never edit it. */
const CAVOS_APP_SALT = "compaki-v1";

export interface CompakiWallet {
  /** Signs a transaction the API prepared; returns the signed envelope. */
  signXdr: (xdr: string) => Promise<string>;
  /** Clears the Cavos session (on sign-out). */
  logout: () => void;
}

const WalletContext = createContext<CompakiWallet | null>(null);

/** The signed-in user's Cavos wallet signer, or null (custodial/no wallet). */
export function useCompakiWallet(): CompakiWallet | null {
  return useContext(WalletContext);
}

function WalletBridge({ children }: { children: React.ReactNode }) {
  const { wallet, logout } = useCavos();
  const value = useMemo<CompakiWallet | null>(() => {
    if (!wallet || wallet.chain !== "stellar") return null;
    return { signXdr: (xdr) => wallet.signXdr(xdr), logout };
  }, [wallet, logout]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function CompakiCavosProvider({ children }: { children: React.ReactNode }) {
  if (!cavosConfigured) return <>{children}</>;
  return (
    <CavosProvider
      config={{
        appId: CAVOS_APP_ID,
        environment: process.env.NEXT_PUBLIC_CAVOS_ENV === "production" ? "production" : "development",
        chains: ["stellar"],
        defaultChain: "stellar",
        network: "testnet",
        appSalt: CAVOS_APP_SALT,
      }}
      modal={{ appName: "Compaki" }}
    >
      <WalletBridge>{children}</WalletBridge>
    </CavosProvider>
  );
}
