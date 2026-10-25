// GET /api/demo/impersonate?userId=..&redirect=/vendor/slug
// DEMO-ONLY account switcher so a presenter can hop from the operator view to
// one of their vendors' dashboards in one browser.
//
// Disabled by default. It only works when ALL of these hold:
//   - ENABLE_DEMO_IMPERSONATION=true is set explicitly,
//   - NODE_ENV is not "production" (it can never be enabled there),
//   - the requester is signed in as the operator of a marketplace in which
//     the target user is a vendor.
// Otherwise the route answers 404 as if it didn't exist. Prefer real
// sign-ins (seed users get DEMO_SEED_PASSWORD, see README).

import { Hono } from "hono";

import { prisma } from "@/lib/db";
import { getSessionUser, sessionCookieHeader } from "@/lib/session";

export const demo = new Hono();

export function demoImpersonationEnabled(): boolean {
  return (
    process.env.ENABLE_DEMO_IMPERSONATION === "true" && process.env.NODE_ENV !== "production"
  );
}

demo.get("/impersonate", async (c) => {
  if (!demoImpersonationEnabled()) return c.json({ error: "Not found" }, 404);

  const requester = await getSessionUser(c);
  if (!requester) return c.json({ error: "Sign in as the operator first" }, 401);

  const userId = c.req.query("userId") ?? "";
  const redirect = c.req.query("redirect") ?? "/";
  if (!redirect.startsWith("/") || redirect.startsWith("//")) {
    return c.json({ error: "Invalid redirect" }, 400);
  }

  // Only an operator may switch, and only into one of their own vendors.
  const membership = await prisma.vendorMembership.findFirst({
    where: { userId, marketplace: { operatorId: requester.id } },
    select: { userId: true },
  });
  if (!membership) return c.json({ error: "Not allowed" }, 403);

  // Relative Location on purpose: the browser resolves it against the web
  // app's origin (the request arrives through the /api proxy).
  c.header("Set-Cookie", sessionCookieHeader(c, membership.userId));
  return c.redirect(redirect, 302);
});
