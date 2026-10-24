// Cavos (email login + user-owned Stellar wallets), server side.
//
// Cavos derives each user's Stellar wallet from their login and keeps the
// key in its vault; Compaki never sees it. The API trusts two proofs only:
//
//   1. Wallet ownership — the browser signs a one-time challenge with the
//      wallet (Cavos `signMessage`); we verify the ed25519 signature here.
//   2. Email ownership (optional) — the login token Cavos keeps in the
//      browser: for email codes an ES256 JWT from Cavos' recovery enclave
//      (iss https://enclave.cavos.xyz), for "Continue with Google" Google's
//      own RS256 id_token. If it verifies against the issuer's published keys
//      (and Google marks the email verified), its email is trusted; otherwise
//      the email the browser reports is ignored for anything
//      security-relevant (no account linking by email).

import { createPublicKey, randomBytes, verify as verifySignature, type JsonWebKey } from "node:crypto";

import { Keypair } from "@stellar/stellar-sdk";

import { isValidAccountAddress } from "@/lib/stellar";

export const CAVOS_ENCLAVE_ISSUER = "https://enclave.cavos.xyz";
const ENCLAVE_JWKS_URL = `${CAVOS_ENCLAVE_ISSUER}/.well-known/jwks.json`;
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
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

// ── Login tokens (enclave ES256 / Google RS256) ──────────────────────────────

type Jwk = JsonWebKey & { kid?: string };
const jwksCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();

async function publishedKeys(url: string): Promise<Jwk[]> {
  const cached = jwksCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < 60 * 60 * 1000) return cached.keys;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS unavailable (${res.status}) at ${url}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = body.keys ?? [];
  jwksCache.set(url, { keys, fetchedAt: Date.now() });
  return keys;
}

function base64UrlJson(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
}

function audiences(claims: Record<string, unknown>): unknown[] {
  return Array.isArray(claims.aud) ? claims.aud : claims.aud === undefined ? [] : [claims.aud];
}

/**
 * Returns the verified, lower-cased email from the login token Cavos keeps in
 * the browser, or null when the token is missing, malformed, expired, not
 * signed by its issuer, for another app, or carries no verified email.
 * Never throws.
 *
 *   - Cavos enclave (email code): ES256, enclave JWKS; with CAVOS_APP_ID set
 *     its `aud`, when present, must include the app id.
 *   - Google (Continue with Google): RS256, Google JWKS, email_verified must
 *     be true. Its `aud` is Cavos' Google OAuth client; pin it with
 *     CAVOS_GOOGLE_CLIENT_ID (logged here until pinned).
 */
export async function verifiedEmailFromCavosToken(token: string | null | undefined): Promise<string | null> {
  try {
    if (!token) return null;
    const [headerPart, payloadPart, signaturePart] = token.split(".");
    if (!headerPart || !payloadPart || !signaturePart) return null;
    const header = base64UrlJson(headerPart);
    const claims = base64UrlJson(payloadPart);
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return null;

    let jwksUrl: string;
    if (claims.iss === CAVOS_ENCLAVE_ISSUER && header.alg === "ES256") {
      jwksUrl = ENCLAVE_JWKS_URL;
      const appId = process.env.CAVOS_APP_ID;
      if (appId && claims.aud !== undefined && !audiences(claims).includes(appId)) return null;
    } else if (GOOGLE_ISSUERS.includes(String(claims.iss)) && header.alg === "RS256") {
      jwksUrl = GOOGLE_JWKS_URL;
      if (claims.email_verified !== true) return null;
      const clientId = process.env.CAVOS_GOOGLE_CLIENT_ID;
      if (clientId) {
        if (!audiences(claims).includes(clientId)) return null;
      } else {
        console.warn("[cavos] Google token accepted without audience pinning; aud =", claims.aud);
      }
    } else {
      return null;
    }

    const keys = await publishedKeys(jwksUrl);
    const jwk = keys.find((k) => !header.kid || k.kid === header.kid);
    if (!jwk) return null;
    const ok = verifySignature(
      "sha256",
      Buffer.from(`${headerPart}.${payloadPart}`),
      header.alg === "ES256"
        ? { key: createPublicKey({ key: jwk, format: "jwk" }), dsaEncoding: "ieee-p1363" }
        : createPublicKey({ key: jwk, format: "jwk" }),
      Buffer.from(signaturePart, "base64url"),
    );
    if (!ok) return null;

    const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : null;
    if (!email || claims.email_verified === false) {
      console.warn("[cavos] login token verified but carries no usable email; claims:", Object.keys(claims));
      return null;
    }
    return email;
  } catch (error) {
    console.warn("[cavos] login token not verifiable:", error instanceof Error ? error.message : error);
    return null;
  }
}
