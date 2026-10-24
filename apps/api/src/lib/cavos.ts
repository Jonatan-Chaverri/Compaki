// Cavos (email login + user-owned Stellar wallets), server side.
//
// Cavos derives each user's Stellar wallet from their login and keeps the
// key in its vault; Compaki never sees it. The API trusts two proofs only:
//
//   1. Wallet ownership — the browser signs a one-time challenge with the
//      wallet (Cavos `signMessage`); we verify the ed25519 signature here.
//   2. Email ownership (optional) — Cavos' recovery enclave verifies the email
//      code and issues an ES256 JWT (iss https://enclave.cavos.xyz). If that
//      token verifies against the enclave's published keys, its email is
//      trusted; otherwise the email the browser reports is ignored for
//      anything security-relevant (no account linking by email).

import { createPublicKey, randomBytes, verify as verifySignature, type JsonWebKey } from "node:crypto";

import { Keypair } from "@stellar/stellar-sdk";

import { isValidAccountAddress } from "@/lib/stellar";

export const CAVOS_ENCLAVE_ISSUER = "https://enclave.cavos.xyz";
const JWKS_URL = `${CAVOS_ENCLAVE_ISSUER}/.well-known/jwks.json`;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const CAVOS_MESSAGE_PREFIX = "Cavos Signed Message:\n";

// ── Login challenges (in memory: single API instance, demo scale) ──────────

const challenges = new Map<string, { address: string; expiresAt: number }>();

export function createChallenge(address: string): string {
  const now = Date.now();
  for (const [key, entry] of challenges) if (entry.expiresAt < now) challenges.delete(key);
  const nonce = randomBytes(16).toString("hex");
  const message = `Sign in to Compaki\nWallet: ${address}\nNonce: ${nonce}`;
  challenges.set(message, { address, expiresAt: now + CHALLENGE_TTL_MS });
  return message;
}

/** Bytes Cavos signs for `signMessage`: prefix + byte length + "\n" + message. */
function cavosPrefixed(message: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(CAVOS_MESSAGE_PREFIX, "utf8"),
    Buffer.from(String(message.length), "utf8"),
    Buffer.from("\n", "utf8"),
    message,
  ]);
}

/**
 * Consumes a challenge and checks the wallet's signature over it. Cavos'
 * native Stellar wallets sign with the account's own key, so the signing
 * public key must be the wallet address itself.
 */
export function verifyChallengeSignature(params: {
  address: string;
  publicKey: string;
  message: string;
  signatureHex: string;
}): boolean {
  const entry = challenges.get(params.message);
  challenges.delete(params.message); // single use, even on failure
  if (!entry || entry.expiresAt < Date.now() || entry.address !== params.address) return false;
  if (!isValidAccountAddress(params.address) || params.publicKey !== params.address) return false;
  const signature = Buffer.from(params.signatureHex.replace(/^0x/, ""), "hex");
  if (signature.length !== 64) return false;
  const key = Keypair.fromPublicKey(params.address);
  return key.verify(cavosPrefixed(Buffer.from(params.message, "utf8")), signature);
}

// ── Enclave email token (ES256 JWT) ────────────────────────────────────────

let jwksCache: { keys: (JsonWebKey & { kid?: string })[]; fetchedAt: number } | null = null;

async function enclaveKeys(): Promise<(JsonWebKey & { kid?: string })[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < 60 * 60 * 1000) return jwksCache.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`Cavos JWKS unavailable (${res.status})`);
  const body = (await res.json()) as { keys?: (JsonWebKey & { kid?: string })[] };
  jwksCache = { keys: body.keys ?? [], fetchedAt: Date.now() };
  return jwksCache.keys;
}

function base64UrlJson(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
}

/**
 * Returns the verified, lower-cased email from a Cavos enclave email token,
 * or null when the token is missing, malformed, expired, for another app,
 * not signed by the enclave, or carries no email. Never throws.
 */
export async function verifiedEmailFromCavosToken(token: string | null | undefined): Promise<string | null> {
  try {
    if (!token) return null;
    const [headerPart, payloadPart, signaturePart] = token.split(".");
    if (!headerPart || !payloadPart || !signaturePart) return null;
    const header = base64UrlJson(headerPart);
    const claims = base64UrlJson(payloadPart);
    if (header.alg !== "ES256" || claims.iss !== CAVOS_ENCLAVE_ISSUER) return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return null;
    const appId = process.env.CAVOS_APP_ID;
    if (appId && claims.aud !== undefined) {
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (!audiences.includes(appId)) return null;
    }

    const keys = await enclaveKeys();
    const jwk = keys.find((k) => !header.kid || k.kid === header.kid);
    if (!jwk) return null;
    const ok = verifySignature(
      "sha256",
      Buffer.from(`${headerPart}.${payloadPart}`),
      { key: createPublicKey({ key: jwk, format: "jwk" }), dsaEncoding: "ieee-p1363" },
      Buffer.from(signaturePart, "base64url"),
    );
    if (!ok) return null;

    const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : null;
    if (!email || claims.email_verified === false) {
      console.warn("[cavos] enclave token verified but carries no email claim; claims:", Object.keys(claims));
      return null;
    }
    return email;
  } catch (error) {
    console.warn("[cavos] email token not verifiable:", error instanceof Error ? error.message : error);
    return null;
  }
}
