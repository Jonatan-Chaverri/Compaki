// Sign-in with an existing Stellar wallet (Freighter, xBull, Albedo… through
// Stellar Wallets Kit). The API issues a challenge transaction that can never
// be valid on-chain (see buildLoginChallengeTx); the wallet signs it and the
// API checks the signature against the claimed address. In memory on purpose
// (single API instance, demo scale): one live challenge per address, 5
// minutes, single use.

import { randomBytes } from "node:crypto";

import { buildLoginChallengeTx, checkUserSignedXdr } from "@/lib/stellar";

const TTL_MS = 5 * 60 * 1000;
const challenges = new Map<string, { hash: string; expiresAt: number }>();

export function createWalletChallenge(address: string): { xdr: string } {
  const now = Date.now();
  for (const [key, entry] of challenges) if (entry.expiresAt < now) challenges.delete(key);
  // manageData values are at most 64 bytes.
  const prepared = buildLoginChallengeTx({ address, nonce: randomBytes(24).toString("base64") });
  challenges.set(address, { hash: prepared.hash, expiresAt: now + TTL_MS });
  return { xdr: prepared.xdr };
}

/** Consumes the address' challenge; true only if signedXdr is it, signed by the address. */
export function verifyWalletChallenge(address: string, signedXdr: string): boolean {
  const entry = challenges.get(address);
  challenges.delete(address); // single use, even on failure
  if (!entry || entry.expiresAt < Date.now()) return false;
  try {
    checkUserSignedXdr({ signedXdr, expectedHash: entry.hash, signer: address });
    return true;
  } catch {
    return false;
  }
}
