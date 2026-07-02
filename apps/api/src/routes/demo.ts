// GET /api/demo/impersonate?userId=..&redirect=/vendor/slug
// DEMO-ONLY account switcher: Compaki is custodial and passwordless, so the
// presenter can hop between operator and vendor views in one browser.
// A real deployment would replace this with actual authentication.

import { Hono } from "hono";

import { prisma } from "@/lib/db";
import { sessionCookieHeader } from "@/lib/session";

export const demo = new Hono();

demo.get("/impersonate", async (c) => {
  const userId = c.req.query("userId") ?? "";
  const redirect = c.req.query("redirect") ?? "/";

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return c.json({ error: "User not found" }, 404);
  if (!redirect.startsWith("/")) {
    return c.json({ error: "Invalid redirect" }, 400);
  }

  // Relative Location on purpose: the browser resolves it against the web
  // app's origin (the request arrives through the /api proxy).
  c.header("Set-Cookie", sessionCookieHeader(user.id));
  return c.redirect(redirect, 302);
});
