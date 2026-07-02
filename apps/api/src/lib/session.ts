// Session cookie: an httpOnly cookie holding "userId.signature", where the
// signature is an HMAC over the user id. Forging a session requires the
// server secret. The cookie is set on API responses and reaches the browser
// through the web app's same-origin /api proxy; Path=/ makes the one session
// valid across every marketplace.

import { createHmac, timingSafeEqual } from "node:crypto";

import type { Context } from "hono";
import { getCookie } from "hono/cookie";

import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "compaki_session";

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET ?? process.env.WALLET_ENCRYPTION_KEY;
  if (!secret) throw new Error("SESSION_SECRET or WALLET_ENCRYPTION_KEY must be set");
  return secret;
}

function sign(userId: string): string {
  return createHmac("sha256", sessionSecret()).update(userId).digest("hex");
}

export function sessionCookieHeader(userId: string): string {
  const value = `${userId}.${sign(userId)}`;
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Current user from the session cookie, or null. */
export async function getSessionUser(c: Context) {
  const raw = getCookie(c, SESSION_COOKIE);
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = raw.slice(0, dot);
  const signature = Buffer.from(raw.slice(dot + 1));
  const expected = Buffer.from(sign(userId));
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    return null;
  }
  return prisma.user.findUnique({ where: { id: userId } });
}
