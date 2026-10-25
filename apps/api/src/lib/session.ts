// Session cookie: an httpOnly cookie holding "userId.expiresAt.signature",
// where the signature is an HMAC over the user id and the expiry (Unix
// seconds). Forging or extending a session requires the server's key, and an
// expired cookie is refused even if a browser keeps sending it. The cookie is
// set on API responses and reaches the browser through the web app's
// same-origin /api proxy; Path=/ makes the one session valid across every
// marketplace. It is marked Secure whenever the request came over HTTPS.
//
// The key is SESSION_SECRET. Without it, a key derived from
// WALLET_ENCRYPTION_KEY for this purpose only is used, so the wallet key
// itself never signs cookies; set SESSION_SECRET to keep them independent.

import { createHmac, timingSafeEqual } from "node:crypto";

import type { Context } from "hono";
import { getCookie } from "hono/cookie";

import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "compaki_session";
export const SESSION_SECONDS = 30 * 24 * 60 * 60;

let warnedDerivedKey = false;

function sessionKey(): Buffer {
  const own = process.env.SESSION_SECRET;
  if (own) return Buffer.from(own);
  const walletKey = process.env.WALLET_ENCRYPTION_KEY;
  if (!walletKey) throw new Error("SESSION_SECRET or WALLET_ENCRYPTION_KEY must be set");
  if (!warnedDerivedKey) {
    warnedDerivedKey = true;
    console.warn("[session] SESSION_SECRET is not set: using a key derived from WALLET_ENCRYPTION_KEY. Set SESSION_SECRET to keep them independent.");
  }
  return createHmac("sha256", walletKey).update("compaki session cookies").digest();
}

function sign(payload: string): string {
  return createHmac("sha256", sessionKey()).update(payload).digest("hex");
}

/** The cookie value for a session of `userId` starting at `now` (ms). */
export function sessionValue(userId: string, now = Date.now()): string {
  const payload = `${userId}.${Math.floor(now / 1000) + SESSION_SECONDS}`;
  return `${payload}.${sign(payload)}`;
}

/** The user a cookie value authenticates at `now` (ms), or null if it's forged, malformed or expired. */
export function userIdOfSession(value: string, now = Date.now()): string | null {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAt, signature] = parts;
  if (!userId || !/^\d+$/.test(expiresAt) || Number(expiresAt) * 1000 <= now) return null;
  const given = Buffer.from(signature);
  const expected = Buffer.from(sign(`${userId}.${expiresAt}`));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return userId;
}

/** True when the browser reached us over HTTPS (directly or through the web app's proxy). */
function overHttps(c: Context): boolean {
  const forwarded = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  return (forwarded ?? new URL(c.req.url).protocol.replace(":", "")) === "https";
}

function cookieAttributes(c: Context, maxAge: number): string {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${overHttps(c) ? "; Secure" : ""}`;
}

export function sessionCookieHeader(c: Context, userId: string): string {
  return `${SESSION_COOKIE}=${sessionValue(userId)}; ${cookieAttributes(c, SESSION_SECONDS)}`;
}

export function clearSessionCookieHeader(c: Context): string {
  return `${SESSION_COOKIE}=; ${cookieAttributes(c, 0)}`;
}

/** Current user from the session cookie, or null. */
export async function getSessionUser(c: Context) {
  const raw = getCookie(c, SESSION_COOKIE);
  const userId = raw ? userIdOfSession(raw) : null;
  return userId ? prisma.user.findUnique({ where: { id: userId } }) : null;
}
