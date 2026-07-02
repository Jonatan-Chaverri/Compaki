// Demo-grade auth: a plain httpOnly cookie holding the user id. No passwords —
// onboarding signs the operator in automatically ("magic-link style").

import { cookies } from "next/headers";

import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "compaki_uid";

export function sessionCookieHeader(userId: string): string {
  return `${SESSION_COOKIE}=${userId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;
}

/** Current user from the session cookie, or null. Server-side only. */
export async function getSessionUser() {
  const store = await cookies();
  const userId = store.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}
