// Sign-in with an existing Stellar wallet (Freighter, xBull, Albedo… through
// Stellar Wallets Kit), using a standard SEP-10 challenge (see sep10.ts): the
// wallet signs it and the API verifies it, then sets a session cookie. Each
// challenge is accepted once (kept in memory until it expires; single API
// instance, demo scale).

import { buildChallenge, verifyChallenge } from "@/lib/sep10";

const used = new Map<string, number>();

export function createWalletChallenge(address: string): { xdr: string } {
  return { xdr: buildChallenge(address) };
}

/** True only for an unused challenge for `address`, signed as SEP-10 requires. */
export async function verifyWalletChallenge(address: string, signedXdr: string): Promise<boolean> {
  const now = Date.now();
  for (const [hash, expiresAt] of used) if (expiresAt < now) used.delete(hash);
  try {
    const { account, hash, expiresAt } = await verifyChallenge(signedXdr);
    if (account !== address || used.has(hash)) return false;
    used.set(hash, expiresAt);
    return true;
  } catch {
    return false;
  }
}
