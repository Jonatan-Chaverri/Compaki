// Existing Stellar wallets (Freighter, xBull, Albedo, Lobstr, Hana…) through
// Stellar Wallets Kit. Loaded on demand — the kit touches browser storage at
// import time and is large, so it never runs during server rendering. The kit
// remembers the chosen wallet in localStorage between visits.

import { getResolvedTheme } from "./theme";

let updateKitTheme: (() => void) | null = null;

/** The SDK stays lazy; appearance updates never initialize a wallet session. */
export function syncStellarWalletTheme(): void {
  updateKitTheme?.();
}

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

let ready: Promise<
  typeof import("@creit.tech/stellar-wallets-kit/sdk").StellarWalletsKit
> | null = null;

function kit() {
  ready ??= (async () => {
    const [
      { StellarWalletsKit },
      { defaultModules },
      { Networks, SwkAppDarkTheme, SwkAppLightTheme },
    ] = await Promise.all([
      import("@creit.tech/stellar-wallets-kit/sdk"),
      import("@creit.tech/stellar-wallets-kit/modules/utils"),
      import("@creit.tech/stellar-wallets-kit/types"),
    ]);
    StellarWalletsKit.init({
      modules: defaultModules(),
      network: Networks.TESTNET,
    });
    updateKitTheme = () =>
      StellarWalletsKit.setTheme(
        getResolvedTheme() === "dark" ? SwkAppDarkTheme : SwkAppLightTheme,
      );
    updateKitTheme();
    return StellarWalletsKit;
  })();
  return ready;
}

/** Opens the wallet picker and returns the connected account's address. */
export async function connectStellarWallet(): Promise<string> {
  const { address } = await (await kit()).authModal();
  return address;
}

/** Asks the connected wallet to sign a testnet transaction for `address`. */
export async function signWithStellarWallet(
  xdr: string,
  address: string,
): Promise<string> {
  const { signedTxXdr } = await (
    await kit()
  ).signTransaction(xdr, {
    networkPassphrase: TESTNET_PASSPHRASE,
    address,
  });
  return signedTxXdr;
}

export async function disconnectStellarWallet(): Promise<void> {
  if (!ready) return; // never loaded in this tab: nothing to disconnect
  await (await kit()).disconnect().catch(() => undefined);
}
