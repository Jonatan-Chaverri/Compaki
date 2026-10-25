"use client";

// The user's own Stellar wallet, from either source:
//   - Cavos: email/Google login + a wallet derived from it, key in the Cavos
//     vault (enabled with NEXT_PUBLIC_CAVOS_APP_ID);
//   - an existing wallet (Freighter, xBull, Albedo…) via Stellar Wallets Kit.
// Compaki never sees either key. Pages ask for a signature through
// useCompakiWallet().signXdr(xdr, address): the open Cavos wallet signs when it
// is that address, otherwise the connected Stellar wallet is asked to.

import { CavosProvider, useCavos } from "@cavos/kit/react";
import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

import {
  getResolvedTheme,
  getServerResolvedTheme,
  subscribeThemePreference,
} from "@/lib/theme";
import {
  disconnectStellarWallet,
  signWithStellarWallet,
} from "@/lib/stellar-wallets";

export const CAVOS_APP_ID = process.env.NEXT_PUBLIC_CAVOS_APP_ID ?? "";
export const cavosConfigured = CAVOS_APP_ID !== "";

/** Changing it changes every user's derived wallet address — never edit it. */
const CAVOS_APP_SALT = "compaki-v1";

export interface CompakiWallet {
  /** Signs a transaction the API prepared for `address`; returns the signed envelope. */
  signXdr: (xdr: string, address: string) => Promise<string>;
  /** Ends the wallet sessions (on sign-out). */
  logout: () => void;
}

const stellarWalletOnly: CompakiWallet = {
  signXdr: (xdr, address) => signWithStellarWallet(xdr, address),
  logout: () => void disconnectStellarWallet(),
};

const WalletContext = createContext<CompakiWallet>(stellarWalletOnly);

export function useCompakiWallet(): CompakiWallet {
  return useContext(WalletContext);
}

function CavosBridge({ children }: { children: React.ReactNode }) {
  const { wallet, logout } = useCavos();
  const value = useMemo<CompakiWallet>(
    () => ({
      signXdr: (xdr, address) =>
        wallet?.chain === "stellar" && wallet.address === address
          ? wallet.signXdr(xdr)
          : signWithStellarWallet(xdr, address),
      logout: () => {
        logout();
        void disconnectStellarWallet();
      },
    }),
    [wallet, logout],
  );
  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function CompakiCavosProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = useSyncExternalStore(
    subscribeThemePreference,
    getResolvedTheme,
    getServerResolvedTheme,
  );
  if (!cavosConfigured) return <>{children}</>;
  return (
    <CavosProvider
      config={{
        appId: CAVOS_APP_ID,
        environment:
          process.env.NEXT_PUBLIC_CAVOS_ENV === "production"
            ? "production"
            : "development",
        chains: ["stellar"],
        defaultChain: "stellar",
        network: "testnet",
        appSalt: CAVOS_APP_SALT,
      }}
      modal={{ appName: "Compaki", theme }}
    >
      <CavosBridge>{children}</CavosBridge>
    </CavosProvider>
  );
}
