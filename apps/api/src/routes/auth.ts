// /api/auth — authentication.
//
//   POST /cavos/challenge  { address } → one-time message for the wallet to sign
//   POST /cavos            Cavos wallet login: verifies the wallet's signature
//                          over the challenge (+ the Cavos email token, when
//                          verifiable), links/creates the Compaki user, sets
//                          the session cookie
//   POST /profile          name, country for the signed-in user (first login)
//   POST /login            email + password (existing/demo accounts)
//   POST /logout           clears the session cookie
//
// New accounts are created only through Cavos. An existing account is linked
// to a Cavos wallet in exactly two cases: the email comes from a Cavos token
// we verified ourselves (Cavos proved the user received the code), or the
// user is already signed in to that account when connecting the wallet.
// A merely reported email is never enough — knowing an address is not proof
// of owning it. Legacy passwordless users can't be claimed through /login;
// `npm run users:set-password -- <email>` remains for demo accounts.

import { Hono } from "hono";

import { createChallenge, verifiedEmailFromCavosToken, verifyChallengeSignature } from "@/lib/cavos";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/passwords";
import {
  clearSessionCookieHeader,
  getSessionUser,
  sessionCookieHeader,
} from "@/lib/session";
import { isValidAccountAddress } from "@/lib/stellar";

export const auth = new Hono();

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function publicUser(user: { id: string; name: string; email: string | null; country: string | null }) {
  return { id: user.id, name: user.name, email: user.email, country: user.country };
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown> | null> {
  try {
    return ((await c.req.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return null;
  }
}

auth.post("/cavos/challenge", async (c) => {
  const b = await readJson(c);
  const address = typeof b?.address === "string" ? b.address : "";
  if (!isValidAccountAddress(address)) return c.json({ error: "Invalid wallet address" }, 400);
  return c.json({ message: createChallenge(address) });
});

auth.post("/cavos", async (c) => {
  const b = await readJson(c);
  if (!b) return c.json({ error: "Invalid JSON" }, 400);
  const str = (key: string) => (typeof b[key] === "string" ? (b[key] as string) : "");
  const address = str("address");
  const signatureOk = verifyChallengeSignature({
    address,
    publicKey: str("publicKey"),
    message: str("message"),
    signatureHex: str("signature"),
  });
  if (!signatureOk) {
    return c.json({ error: "We couldn't verify your wallet signature — please sign in again" }, 401);
  }
  const verifiedEmail = await verifiedEmailFromCavosToken(str("emailToken") || null);
  // Linking to the current session is an explicit action ("connect wallet"),
  // never a side effect of signing in on a shared browser.
  const sessionUser = b.link === true ? await getSessionUser(c) : null;

  let user = await prisma.user.findUnique({ where: { cavosAddress: address } });
  if (!user) {
    // Link an existing account: the signed-in one, or the one owning the
    // verified email. Never one that already has a different wallet.
    const candidate =
      sessionUser ??
      (verifiedEmail ? await prisma.user.findUnique({ where: { email: verifiedEmail } }) : null);
    if (candidate?.cavosAddress && candidate.cavosAddress !== address) {
      return c.json({ error: "This account is already linked to a different wallet" }, 409);
    }
    if (candidate) {
      user = await prisma.user.update({
        where: { id: candidate.id },
        data: { cavosAddress: address, cavosWalletReadyAt: null },
      });
    } else {
      const emailTaken = verifiedEmail
        ? await prisma.user.findUnique({ where: { email: verifiedEmail }, select: { id: true } })
        : null;
      user = await prisma.user.create({
        data: {
          email: verifiedEmail && !emailTaken ? verifiedEmail : null,
          name: (verifiedEmail ?? "Compaki member").split("@")[0],
          role: "BUYER",
          cavosAddress: address,
        },
      });
    }
  }

  c.header("Set-Cookie", sessionCookieHeader(user.id));
  return c.json({
    user: publicUser(user),
    emailVerified: verifiedEmail !== null,
    needsProfile: !user.country,
    walletReady: user.cavosWalletReadyAt !== null,
  });
});

auth.post("/profile", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const b = await readJson(c);
  if (!b) return c.json({ error: "Invalid JSON" }, 400);
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) : "";
  const country = typeof b.country === "string" ? b.country.trim().slice(0, 60) : "";
  if (name.length < 2) return c.json({ error: "Please tell us your name" }, 400);
  if (country.length < 2) return c.json({ error: "Please tell us your country of residence" }, 400);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { name, country } });
  return c.json({ user: publicUser(updated) });
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
