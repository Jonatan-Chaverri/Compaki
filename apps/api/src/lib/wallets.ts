// Which Stellar address holds a user's money.
//
// Every user signs in with their own wallet — a Cavos wallet (email/Google)
// or a Stellar wallet they already had (Freighter, xBull, Albedo…) — whose
// key Compaki never sees. Purchases, vendor revenue and member rewards use
// that wallet once it is set up (funded + trusting the demo asset), and the
// user signs in the browser. Marketplace owners are registered with that
// wallet as operator too (see src/routes/marketplaces.ts).

export type WalletProvider = "cavos" | "stellar-wallet";

export interface WalletUser {
  walletAddress: string | null;
  walletProvider: string | null;
  walletReadyAt: Date | null;
}

export type PersonalWallet =
  | { kind: "own"; address: string; provider: WalletProvider }
  | { kind: "none" };

/** Rows from before walletProvider existed were all Cavos wallets. */
export function ownWalletProvider(user: WalletUser): WalletProvider {
  return user.walletProvider === "stellar-wallet" ? "stellar-wallet" : "cavos";
}

export function personalWallet(user: WalletUser): PersonalWallet {
  if (user.walletAddress && user.walletReadyAt) {
    return { kind: "own", address: user.walletAddress, provider: ownWalletProvider(user) };
  }
  return { kind: "none" };
}

/** True when an own wallet is linked but its one-time setup hasn't run. */
export function ownWalletPending(user: WalletUser): boolean {
  return Boolean(user.walletAddress && !user.walletReadyAt);
}

/** The addresses that can belong to this user (for matching participants). */
export function userAddresses(user: WalletUser): string[] {
  return user.walletAddress ? [user.walletAddress] : [];
}
