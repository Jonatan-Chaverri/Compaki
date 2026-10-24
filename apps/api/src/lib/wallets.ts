// Which Stellar address holds a user's personal money.
//
// Users who signed in with Cavos own a wallet whose key Compaki never sees:
// purchases, vendor revenue and member rewards use it as soon as it is set up
// (funded + trusting the demo asset), and the user signs in the browser.
// Everyone else still uses the custodial account the backend signs for.
// Operator actions always use the custodial account (it is the marketplace's
// on-chain operator address).

export interface WalletUser {
  stellarPublicKey: string | null;
  stellarSecretEncrypted: string | null;
  cavosAddress: string | null;
  cavosWalletReadyAt: Date | null;
}

export type PersonalWallet =
  | { kind: "cavos"; address: string }
  | { kind: "custodial"; address: string; secretEncrypted: string }
  | { kind: "none" };

export function personalWallet(user: WalletUser): PersonalWallet {
  if (user.cavosAddress && user.cavosWalletReadyAt) {
    return { kind: "cavos", address: user.cavosAddress };
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

/** True when a Cavos wallet is linked but its one-time setup hasn't run. */
export function cavosWalletPending(user: WalletUser): boolean {
  return Boolean(user.cavosAddress && !user.cavosWalletReadyAt);
}

/** Every address that can belong to this user (for matching beneficiaries). */
export function userAddresses(user: WalletUser): string[] {
  return [user.cavosAddress, user.stellarPublicKey].filter(
    (a): a is string => typeof a === "string",
  );
}
