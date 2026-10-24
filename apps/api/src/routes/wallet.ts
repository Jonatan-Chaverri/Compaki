// /api/wallet — the signed-in user's Cavos wallet.
//
//   GET  /        wallet address, provider and setup state
//   POST /setup   one-time setup: funds the address with testnet XLM
//                 (Friendbot — which creates the account; Cavos derives its key
//                 from the user's login, so the wallet is usable as soon as the
//                 account exists), then returns the trustline + starting
//                 demo-balance transaction for the wallet to sign. When it is
//                 already set up, just marks it ready.

import { Hono } from "hono";

import { prisma } from "@/lib/db";
import { createPending, signatureRequest, type PendingTx } from "@/lib/pending-tx";
import { getSessionUser } from "@/lib/session";
import {
  demoTrustlineState,
  fundWithFriendbot,
  getUsdBalance,
  prepareTrustlineSetup,
  sleep,
  stellarConfig,
} from "@/lib/stellar";
import { personalWallet } from "@/lib/wallets";

export const wallet = new Hono();

const STARTING_DEMO_USD = 100;

wallet.get("/", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const personal = personalWallet(user);
  let balanceUsd: number | null = null;
  if (personal.kind !== "none") {
    balanceUsd = await getUsdBalance(personal.address).catch(() => null);
  }
  return c.json({
    provider: personal.kind,
    address: personal.kind === "none" ? null : personal.address,
    cavosAddress: user.cavosAddress,
    cavosReady: user.cavosWalletReadyAt !== null,
    balanceUsd,
    assetCode: stellarConfig.usdcCode,
  });
});

wallet.post("/setup", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Not signed in" }, 401);
  if (!user.cavosAddress) return c.json({ error: "Connect your Cavos wallet first" }, 409);
  if (user.cavosWalletReadyAt) return c.json({ ready: true });
  const address = user.cavosAddress;

  try {
    let state = await demoTrustlineState(address);
    if (state === "missing") {
      await fundWithFriendbot(address);
      for (let attempt = 0; attempt < 10 && state === "missing"; attempt++) {
        await sleep(2_000); // Friendbot lands before Horizon serves the account
        state = await demoTrustlineState(address);
      }
      if (state === "missing") throw new Error("Funded account never appeared on Horizon");
    }
    if (state === "ready") {
      await prisma.user.update({ where: { id: user.id }, data: { cavosWalletReadyAt: new Date() } });
      return c.json({ ready: true });
    }

    const prepared = await prepareTrustlineSetup({ publicKey: address, startingUsd: STARTING_DEMO_USD });
    const pending = createPending({
      kind: "wallet-setup",
      userId: user.id,
      signer: address,
      xdr: prepared.xdr,
      hash: prepared.hash,
      context: {},
    });
    return c.json(signatureRequest(pending, "Activate your wallet"), 202);
  } catch (error) {
    console.error("[wallet-setup] failed:", error);
    return c.json({ error: "Could not set up your wallet — please try again." }, 500);
  }
});

/** Called by POST /api/tx/:id once the setup transaction confirmed. */
export async function completeWalletSetup(pending: PendingTx) {
  await prisma.user.update({
    where: { id: pending.userId },
    data: { cavosWalletReadyAt: new Date() },
  });
  return { ready: true };
}
