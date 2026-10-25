// SEP-10 Stellar Web Authentication (https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md).
//
// Proves control of a Stellar account without moving funds: the server
// issues a challenge transaction (sequence 0, so it can never be submitted)
// signed with its SIGNING_KEY, which stellar.toml publishes (SEP-1); the
// wallet adds its signature and the server verifies both. Built on the SDK's
// WebAuth helpers. Used by:
//   - GET/POST /api/auth/sep10: the standard endpoint (answers a JWT), so any
//     SEP-10 client can authenticate against Compaki;
//   - wallet sign-in (/api/auth/wallet): the same challenge, exchanged for a
//     session cookie instead of a JWT.
//
// HOME_DOMAIN is the web app's host (it serves stellar.toml and proxies /api,
// so it is also the web_auth_domain). The signing key comes from
// SEP10_SIGNING_SECRET, or is derived from the session secret so it stays
// stable across restarts without another variable; it never holds funds.

import { createHmac } from "node:crypto";

import { Keypair, WebAuth } from "@stellar/stellar-sdk";

import { stellarConfig } from "@/lib/stellar";

/** How long a challenge is valid (SEP-10 recommends 15 minutes). */
const CHALLENGE_SECONDS = 15 * 60;
/** Lifetime of a SEP-10 JWT. */
const TOKEN_SECONDS = 24 * 60 * 60;

function appSecret(): string {
  const secret = process.env.SESSION_SECRET ?? process.env.WALLET_ENCRYPTION_KEY;
  if (!secret) throw new Error("SESSION_SECRET or WALLET_ENCRYPTION_KEY must be set");
  return secret;
}

export function signingKeypair(): Keypair {
  const configured = process.env.SEP10_SIGNING_SECRET;
  if (configured) return Keypair.fromSecret(configured);
  return Keypair.fromRawEd25519Seed(createHmac("sha256", appSecret()).update("compaki sep-10 signing key").digest());
}

/** The web app's host, e.g. "compaki.example" ("localhost:3000" locally). */
export function homeDomain(): string {
  return process.env.HOME_DOMAIN ?? "localhost:3000";
}

function origin(): string {
  const domain = homeDomain();
  return `${/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(domain) ? "http" : "https"}://${domain}`;
}

export function webAuthEndpoint(): string {
  return `${origin()}/api/auth/sep10`;
}

export function homeOrigin(): string {
  return origin();
}

export class Sep10Error extends Error {}

/** A challenge for `account` (G…), signed by the server. Returns base64 XDR. */
export function buildChallenge(account: string, requestedHomeDomain?: string): string {
  const domain = homeDomain();
  if (requestedHomeDomain && requestedHomeDomain !== domain) {
    throw new Sep10Error(`home_domain must be ${domain}`);
  }
  try {
    return WebAuth.buildChallengeTx(
      signingKeypair(),
      account,
      domain,
      CHALLENGE_SECONDS,
      stellarConfig.networkPassphrase,
      domain,
    );
  } catch (error) {
    throw new Sep10Error(error instanceof Error ? error.message : "Invalid account");
  }
}

/** The account's signers and medium threshold, or null when it doesn't exist on the network. */
async function signersOf(account: string) {
  const res = await fetch(`${stellarConfig.horizonUrl}/accounts/${account}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Horizon account lookup failed (${res.status})`);
  const body = (await res.json()) as {
    thresholds: { med_threshold: number };
    signers: { key: string; weight: number; type: string }[];
  };
  return {
    threshold: body.thresholds.med_threshold,
    signers: body.signers.filter((s) => s.type === "ed25519_public_key"),
  };
}

/**
 * Verifies a challenge the client signed, as SEP-10 requires: issued and
 * signed by this server for this home domain, still within its time bounds,
 * and signed by the client account — by signers meeting its medium threshold
 * when the account exists, or by its master key when it doesn't yet.
 * Returns the authenticated account and the challenge's hash.
 */
export async function verifyChallenge(signedXdr: string): Promise<{ account: string; hash: string; expiresAt: number }> {
  const server = signingKeypair().publicKey();
  const domain = homeDomain();
  const passphrase = stellarConfig.networkPassphrase;
  try {
    const { tx, clientAccountID } = WebAuth.readChallengeTx(signedXdr, server, passphrase, domain, domain);
    const onChain = await signersOf(clientAccountID);
    if (onChain) {
      WebAuth.verifyChallengeTxThreshold(signedXdr, server, passphrase, onChain.threshold, onChain.signers, domain, domain);
    } else {
      WebAuth.verifyChallengeTxSigners(signedXdr, server, passphrase, [clientAccountID], domain, domain);
    }
    const maxTime = Number(tx.timeBounds?.maxTime ?? 0) * 1000;
    return { account: clientAccountID, hash: tx.hash().toString("hex"), expiresAt: maxTime };
  } catch (error) {
    if (error instanceof WebAuth.InvalidChallengeError) throw new Sep10Error(error.message);
    throw error;
  }
}

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

/** The SEP-10 JWT (HS256) for an authenticated account. */
export function issueToken(account: string, challengeHash: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ iss: webAuthEndpoint(), sub: account, iat: now, exp: now + TOKEN_SECONDS, jti: challengeHash }),
  );
  const signature = createHmac("sha256", `${appSecret()}:sep10-jwt`).update(`${header}.${payload}`).digest();
  return `${header}.${payload}.${base64url(signature)}`;
}
