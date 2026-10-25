// Transactions waiting for the user's wallet signature.
//
// For user-owned (Cavos) wallets the API prepares a transaction, keeps it
// here, and sends the browser its unsigned XDR plus an id. The browser signs
// with the wallet (`signXdr`) and posts the signed envelope to
// POST /api/tx/:id, which only submits it if it still hashes to the stored
// transaction — the client can never swap in a different one.
//
// In-memory on purpose (single API instance, demo scale): a restart drops
// pending signatures and the user simply retries the action.

import { randomUUID } from "node:crypto";

const TTL_MS = 3 * 60 * 1000; // matches the transactions' 180s time bounds

export type PendingKind =
  | "wallet-setup"
  | "purchase"
  | "claim"
  | "create-marketplace"
  | "join"
  | "next-rules"
  | "next-target";

export interface PendingTx<C = unknown> {
  id: string;
  kind: PendingKind;
  userId: string;
  signer: string;
  xdr: string;
  hash: string;
  context: C;
  expiresAt: number;
}

const store = new Map<string, PendingTx>();

function sweep() {
  const now = Date.now();
  for (const [id, entry] of store) if (entry.expiresAt < now) store.delete(id);
}

export function createPending<C>(entry: Omit<PendingTx<C>, "id" | "expiresAt">): PendingTx<C> {
  sweep();
  const pending: PendingTx<C> = { ...entry, id: randomUUID(), expiresAt: Date.now() + TTL_MS };
  store.set(pending.id, pending as PendingTx);
  return pending;
}

/** Removes and returns the entry if it exists, is fresh and belongs to the user. */
export function takePending(id: string, userId: string): PendingTx | null {
  sweep();
  const entry = store.get(id);
  if (!entry || entry.userId !== userId) return null;
  store.delete(id);
  return entry;
}

/** What the browser receives: sign `xdr` with the wallet, post it to /api/tx/:id. */
export function signatureRequest(pending: PendingTx, label: string, extra: Record<string, unknown> = {}) {
  return {
    signatureRequired: { id: pending.id, xdr: pending.xdr, address: pending.signer, label, ...extra },
  };
}
