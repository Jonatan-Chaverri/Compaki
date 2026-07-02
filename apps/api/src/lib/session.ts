// Demo-grade auth: a plain httpOnly cookie holding the user id. No passwords —
// onboarding signs the operator in automatically ("magic-link style").
// The cookie is set on API responses and reaches the browser through the web
// app's same-origin /api proxy.

import type { Context } from "hono";
import { getCookie } from "hono/cookie";

import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "compaki_uid";

export function sessionCookieHeader(userId: string): string {
  return `${SESSION_COOKIE}=${userId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;
}

/** Current user from the session cookie, or null. */
export async function getSessionUser(c: Context) {
  const userId = getCookie(c, SESSION_COOKIE);
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}
