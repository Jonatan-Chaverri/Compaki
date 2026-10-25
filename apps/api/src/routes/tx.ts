// POST /api/tx/:id — submit a transaction the user signed with their Cavos
// wallet. Body: { signedXdr }.
//
// The id refers to a transaction the API prepared and stored (see
// src/lib/pending-tx.ts). It is only submitted if the signed envelope still
// hashes to that stored transaction and carries the wallet's signature; then
// the flow that asked for it continues (wallet setup, the next item of a
// purchase, a claim, launching a marketplace, a vendor joining, the next
// period's rules or round's target) and its response — possibly the next
// transaction to sign — is returned.

import type { xdr } from "@stellar/stellar-sdk";
import { Hono } from "hono";

import { completePurchaseStep, PurchaseRefusedError, releaseStock, reservePurchaseStock } from "@/lib/checkout";
import { completeLaunch } from "@/lib/launch";
import { takePending, type PendingTx } from "@/lib/pending-tx";
import { completeJoin } from "@/lib/seller-registration";
import { describeContractError } from "@/lib/rewards";
import { getSessionUser } from "@/lib/session";
import { SignedTxMismatchError, submitUserSignedXdr } from "@/lib/stellar";

import { completeClaim, completeNextRules, completeNextTarget } from "./rewards";
import { completeWalletSetup } from "./wallet";

export const tx = new Hono();

const LABELS: Record<PendingTx["kind"], string> = {
  "wallet-setup": "wallet setup",
  purchase: "purchase",
  claim: "claim",
  "create-marketplace": "create marketplace",
  join: "vendor registration",
  "next-rules": "next period's rules",
  "next-target": "next round's target",
};

type Completion = (pending: PendingTx, result: { txHash: string; returnValue: xdr.ScVal | undefined }) => Promise<object>;

/** What continues each flow once its signed transaction confirmed. */
const COMPLETIONS: Record<PendingTx["kind"], Completion> = {
  "wallet-setup": (pending) => completeWalletSetup(pending),
  purchase: completePurchaseStep,
  claim: completeClaim,
  "create-marketplace": completeLaunch,
  join: completeJoin,
  "next-rules": completeNextRules,
  "next-target": completeNextTarget,
};

tx.post("/:id", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Not signed in" }, 401);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const signedXdr = (body as Record<string, unknown> | null)?.signedXdr;
  if (typeof signedXdr !== "string" || signedXdr.length === 0) {
    return c.json({ error: "Missing signed transaction" }, 400);
  }

  const pending = takePending(c.req.param("id"), user.id);
  if (!pending) {
    return c.json({ error: "This signing request expired — please try again" }, 410);
  }

  // A purchase takes its stock before it's submitted (see src/lib/checkout.ts):
  // when the product sold out meanwhile, the signed payment is dropped unsent.
  let reserved: Awaited<ReturnType<typeof reservePurchaseStock>> | null = null;
  if (pending.kind === "purchase") {
    try {
      reserved = await reservePurchaseStock(pending);
    } catch (error) {
      if (error instanceof PurchaseRefusedError) return c.json({ error: error.message }, 409);
      throw error;
    }
  }

  let result;
  try {
    result = await submitUserSignedXdr({
      signedXdr,
      expectedHash: pending.hash,
      signer: pending.signer,
      label: LABELS[pending.kind],
    });
  } catch (error) {
    if (reserved) await releaseStock(reserved, error);
    if (error instanceof SignedTxMismatchError) return c.json({ error: error.message }, 400);
    console.error(`[tx] ${pending.kind} submission failed:`, error);
    return c.json({ error: "The network rejected the transaction — please try again." }, 502);
  }

  try {
    const next = await COMPLETIONS[pending.kind](pending, result);
    return c.json(
      { txHash: result.txHash, ...next },
      typeof next === "object" && next && "signatureRequired" in next ? 202 : 200,
    );
  } catch (error) {
    // The signed transaction is already final on-chain; report it either way.
    const known = describeContractError(error);
    if (known) return c.json({ txHash: result.txHash, error: known.message, code: known.code }, known.status);
    console.error(`[tx] ${pending.kind} confirmed (${result.txHash}) but follow-up failed:`, error);
    return c.json(
      { txHash: result.txHash, error: "Your transaction went through, but we couldn't continue — please retry." },
      500,
    );
  }
});
