// Who signs for a marketplace's operator.
//
// A marketplace is registered on-chain with its owner's own wallet (Cavos or
// an existing Stellar wallet) when they have one: the owner signs in the
// browser, only while present (creating the marketplace, scheduling the next
// rules or target), and receives the operator share in that wallet. Owners
// without one (password and demo accounts) use their custodial account, which
// the backend signs for. Nothing the operator does happens unattended: vendors
// register themselves (`join`) and distributions / releases need no signature.

import { decryptSecret } from "@/lib/stellar";

export type OperatorSigner =
  | { kind: "custodial"; address: string; secret: string }
  | { kind: "own"; address: string };

interface OperatorRecord {
  operatorAddress: string | null;
  operator: { stellarPublicKey: string | null; stellarSecretEncrypted: string | null };
}

/** The operator address registered in the contract (legacy rows: the owner's custodial account). */
export function operatorAddressOf(marketplace: OperatorRecord): string | null {
  return marketplace.operatorAddress ?? marketplace.operator.stellarPublicKey;
}

/** How to get the operator's signature, or null when the marketplace has no operator address yet. */
export function operatorSignerOf(marketplace: OperatorRecord): OperatorSigner | null {
  const address = operatorAddressOf(marketplace);
  if (!address) return null;
  const { stellarPublicKey, stellarSecretEncrypted } = marketplace.operator;
  if (address === stellarPublicKey && stellarSecretEncrypted) {
    return { kind: "custodial", address, secret: decryptSecret(stellarSecretEncrypted) };
  }
  return { kind: "own", address };
}

export const operatorKeysSelect = {
  operatorAddress: true,
  operator: { select: { stellarPublicKey: true, stellarSecretEncrypted: true } },
} as const;
