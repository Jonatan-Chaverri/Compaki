import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { Hono } from "hono";

process.env.WALLET_ENCRYPTION_KEY = "wallet-key-for-tests";
delete process.env.SESSION_SECRET;

const { SESSION_SECONDS, clearSessionCookieHeader, sessionCookieHeader, sessionValue, userIdOfSession } = await import("./session");

const NOW = Date.UTC(2026, 9, 25);

test("a session cookie authenticates its user until it expires", () => {
  const value = sessionValue("user1", NOW);
  assert.equal(userIdOfSession(value, NOW), "user1");
  assert.equal(userIdOfSession(value, NOW + (SESSION_SECONDS - 1) * 1000), "user1");
  assert.equal(userIdOfSession(value, NOW + SESSION_SECONDS * 1000), null);
});

test("forged, extended, re-targeted and old-format cookies are refused", () => {
  const [, expiresAt, signature] = sessionValue("user1", NOW).split(".");
  assert.equal(userIdOfSession(`user2.${expiresAt}.${signature}`, NOW), null);
  assert.equal(userIdOfSession(`user1.${Number(expiresAt) + 86_400}.${signature}`, NOW), null);
  assert.equal(userIdOfSession(`user1.${expiresAt}.${"0".repeat(64)}`, NOW), null);
  // The previous "userId.signature" format had no expiry.
  assert.equal(userIdOfSession(`user1.${signature}`, NOW), null);
  assert.equal(userIdOfSession("", NOW), null);
});

test("SESSION_SECRET signs on its own, and the wallet key itself never signs cookies", () => {
  const derived = sessionValue("user1", NOW);
  const payload = derived.split(".").slice(0, 2).join(".");
  const withWalletKey = createHmac("sha256", "wallet-key-for-tests").update(payload).digest("hex");
  assert.notEqual(derived.split(".")[2], withWalletKey);
  process.env.SESSION_SECRET = "own-session-secret";
  try {
    assert.equal(userIdOfSession(sessionValue("user1", NOW), NOW), "user1");
    assert.equal(userIdOfSession(derived, NOW), null);
  } finally {
    delete process.env.SESSION_SECRET;
  }
});

test("cookies are Secure over HTTPS, including behind the web app's proxy", async () => {
  const app = new Hono();
  app.get("/set", (c) => c.text("", 200, { "Set-Cookie": sessionCookieHeader(c, "user1") }));
  app.get("/clear", (c) => c.text("", 200, { "Set-Cookie": clearSessionCookieHeader(c) }));
  const cookie = async (path: string, init?: RequestInit) => (await app.request(path, init)).headers.get("set-cookie") ?? "";
  assert.doesNotMatch(await cookie("http://localhost:4000/set"), /Secure/);
  assert.match(await cookie("http://localhost:4000/set", { headers: { "x-forwarded-proto": "https" } }), /; Secure$/);
  assert.match(await cookie("https://api.example/set"), /HttpOnly; SameSite=Lax; Max-Age=2592000; Secure/);
  assert.match(await cookie("https://api.example/clear"), /Max-Age=0; Secure/);
});
