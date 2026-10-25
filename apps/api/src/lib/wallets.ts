// Which Stellar address holds a user's personal money.
//
// Users who signed in with their own wallet — a Cavos wallet (email/Google)
// or a Stellar wallet they already had (Freighter, xBull, Albedo…) — keep a
// key Compaki never sees: purchases, vendor revenue and member rewards use
// that wallet as soon as it is set up (funded + trusting the demo asset), and
// the user signs in the browser. Everyone else still uses the custodial
// account the backend signs for. The same applies to marketplace owners: a
// marketplace is registered with its owner's wallet as operator when they
// have one (see src/lib/operator.ts).

export type WalletProvider = "cavos" | "stellar-wallet";

export interface WalletUser {
  stellarPublicKey: string | null;
  stellarSecretEncrypted: string | null;
  walletAddress: string | null;
  walletProvider: string | null;
  walletReadyAt: Date | null;
}

export type PersonalWallet =
  | { kind: "own"; address: string; provider: WalletProvider }
  | { kind: "custodial"; address: string; secretEncrypted: string }
  | { kind: "none" };

/** Rows from before walletProvider existed were all Cavos wallets. */
export function ownWalletProvider(user: WalletUser): WalletProvider {
  return user.walletProvider === "stellar-wallet" ? "stellar-wallet" : "cavos";
}

export function personalWallet(user: WalletUser): PersonalWallet {
  if (user.walletAddress && user.walletReadyAt) {
    return { kind: "own", address: user.walletAddress, provider: ownWalletProvider(user) };
  }
  if (user.stellarPublicKey && user.stellarSecretEncrypted) {
    return {
      kind: "custodial",
      address: user.stellarPublicKey,
      secretEncrypted: user.stellarSecretEncrypted,
    };
  }
  return { kind: "none" };
}

/** True when an own wallet is linked but its one-time setup hasn't run. */
export function ownWalletPending(user: WalletUser): boolean {
  return Boolean(user.walletAddress && !user.walletReadyAt);
}

/** Every address that can belong to this user (for matching beneficiaries). */
export function userAddresses(user: WalletUser): string[] {
  return [user.walletAddress, user.stellarPublicKey].filter(
    (a): a is string => typeof a === "string",
  );
}
