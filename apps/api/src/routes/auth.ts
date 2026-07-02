// /api/auth — email + password authentication.
//
//   POST /register   name, email, password, country → user + session cookie
//   POST /login      email, password → user + session cookie
//   POST /logout     clears the session cookie
//
// Legacy users (created by the passwordless demo flows) have no passwordHash;
// registering with their email claims the account and keeps its payment
// account, marketplaces and purchase history.

import { Hono } from "hono";

import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { clearSessionCookieHeader, sessionCookieHeader } from "@/lib/session";

export const auth = new Hono();

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD_LENGTH = 8;

function publicUser(user: { id: string; name: string; email: string | null; country: string | null }) {
  return { id: user.id, name: user.name, email: user.email, country: user.country };
}

auth.post("/register", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  const country = typeof b.country === "string" ? b.country.trim().slice(0, 60) : "";

  if (name.length < 2) return c.json({ error: "Please tell us your name" }, 400);
  if (!EMAIL_RE.test(email)) return c.json({ error: "Invalid email address" }, 400);
  if (password.length < MIN_PASSWORD_LENGTH) {
    return c.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400);
  }
  if (country.length < 2) return c.json({ error: "Please tell us your country of residence" }, 400);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.passwordHash) {
    return c.json({ error: "That email is already registered — sign in instead" }, 409);
  }

  const passwordHash = await hashPassword(password);
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { name, country, passwordHash },
      })
    : await prisma.user.create({
        data: { name, email, country, passwordHash, role: "BUYER" },
      });

  c.header("Set-Cookie", sessionCookieHeader(user.id));
  return c.json({ user: publicUser(user) }, 201);
});

auth.post("/login", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!EMAIL_RE.test(email) || password === "") {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  c.header("Set-Cookie", sessionCookieHeader(user.id));
  return c.json({ user: publicUser(user) });
});

auth.post("/logout", (c) => {
  c.header("Set-Cookie", clearSessionCookieHeader());
  return c.json({ ok: true });
});
