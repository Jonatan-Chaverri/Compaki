// /api/wallet — the signed-in user's own wallet (Cavos or an existing Stellar
// wallet such as Freighter).
//
//   GET  /        wallet address, provider and setup state
//   POST /setup   one-time setup: funds the address with testnet XLM
//                 (Friendbot — which creates the account if it doesn't exist
//                 yet; a Cavos wallet's key is derived from the login, so it is
//                 usable as soon as the account exists), then returns the trustline + starting
//                 demo-balance transaction for the wallet to sign. When it is
//                 already set up, just marks it ready.
//   POST /mint    testnet faucet: the demo-asset issuer sends $20 of demo
//                 money (self-issued test token, not Circle USDC) to the
//                 user's wallet. Testnet only, capped balance, short cooldown.

import { Hono } from "hono";

import { prisma } from "@/lib/db";
import { createPending, signatureRequest, type PendingTx } from "@/lib/pending-tx";
import { getSessionUser } from "@/lib/session";
import {
  demoTrustlineState,
  fundWithFriendbot,
  getUsdBalance,
  mintDemoUsd,
  prepareTrustlineSetup,
  sleep,
  stellarConfig,
} from "@/lib/stellar";
import { ownWalletPending, ownWalletProvider, personalWallet } from "@/lib/wallets";

export const wallet = new Hono();

const STARTING_DEMO_USD = 100;
const FAUCET_USD = 20;
/** No faucet top-ups above this balance (demo money still costs issuer fees). */
const FAUCET_MAX_BALANCE_USD = 1_000;
const FAUCET_COOLDOWN_MS = 10_000;
const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const lastMintAt = new Map<string, number>();

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
    walletAddress: user.walletAddress,
    walletProvider: user.walletAddress ? ownWalletProvider(user) : null,
    walletReady: user.walletReadyAt !== null,
    balanceUsd,
    assetCode: stellarConfig.usdcCode,
  });
});

wallet.post("/setup", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Not signed in" }, 401);
  if (!user.walletAddress) return c.json({ error: "Connect your wallet first" }, 409);
  if (user.walletReadyAt) return c.json({ ready: true });
  const address = user.walletAddress;

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
      await prisma.user.update({ where: { id: user.id }, data: { walletReadyAt: new Date() } });
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

wallet.post("/mint", async (c) => {
  if (stellarConfig.networkPassphrase !== TESTNET_PASSPHRASE) {
    return c.json({ error: "The demo faucet only exists on testnet" }, 403);
  }
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Not signed in" }, 401);
  if (ownWalletPending(user)) {
    return c.json({ error: "Activate your wallet first", code: "WALLET_SETUP" }, 409);
  }
  const personal = personalWallet(user);
  if (personal.kind === "none") {
    return c.json({ error: "You don't have a wallet yet" }, 409);
  }
  const last = lastMintAt.get(user.id) ?? 0;
  if (Date.now() - last < FAUCET_COOLDOWN_MS) {
    return c.json({ error: "Give it a few seconds before minting again" }, 429);
  }
  lastMintAt.set(user.id, Date.now());

  try {
    const balance = await getUsdBalance(personal.address);
    if (balance >= FAUCET_MAX_BALANCE_USD) {
      return c.json({ error: `You already have $${FAUCET_MAX_BALANCE_USD} or more in demo money` }, 409);
    }
    const txHash = await mintDemoUsd(personal.address, FAUCET_USD);
    return c.json({
      txHash,
      amountUsd: FAUCET_USD,
      balanceUsd: await getUsdBalance(personal.address).catch(() => balance + FAUCET_USD),
    });
  } catch (error) {
    console.error("[wallet-mint] failed:", error);
    return c.json({ error: "Could not mint demo money — please try again." }, 500);
  }
});

/** Called by POST /api/tx/:id once the setup transaction confirmed. */
export async function completeWalletSetup(pending: PendingTx) {
  await prisma.user.update({
    where: { id: pending.userId },
    data: { walletReadyAt: new Date() },
  });
  return { ready: true };
}
