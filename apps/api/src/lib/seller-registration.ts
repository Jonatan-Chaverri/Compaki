import type { xdr } from "@stellar/stellar-sdk";

import { prisma } from "./db";
import { operatorSignerOf } from "./operator";
import { createPending, signatureRequest, type PendingTx } from "./pending-tx";
import type { ProductInput } from "./products";
import { boundOnChainId } from "./rewards";
import { SellerSetupError } from "./seller-errors";
import { createCustodialAccount, decryptSecret, invokeCall, joinCall, prepareCall, registerVendor } from "./stellar";
import { ownWalletPending, personalWallet } from "./wallets";

// The account is enabled globally. Only its payment registration is per market;
// publishing handles that automatically, including retries after a failure.
//
// On-chain registration is signed by the marketplace's operator when the
// backend holds that key (custodial operators), and otherwise by the seller
// (`join`): the backend signs for custodial sellers, and sellers with their
// own wallet approve it in the browser. Then the API answers 202 with the
// transaction to sign, and POST /api/tx/:id finishes the registration
// (completeJoin), creating the product being published, if any.
//
// Serialize setup for one user so concurrent first publications share an account.
const pending = new Map<string, Promise<unknown>>();
export async function ensureMarketplaceVendor(userId: string, marketplaceId: string, product?: ProductInput) {
  const previous = pending.get(userId) ?? Promise.resolve();
  const task = previous.catch(() => {}).then(() => register(userId, marketplaceId, product));
  pending.set(userId, task);
  try { return await task; }
  finally { if (pending.get(userId) === task) pending.delete(userId); }
}

interface JoinContext {
  membershipId: string;
  payoutAddress: string;
  /** The product whose publication triggered the registration. */
  product?: { input: ProductInput; marketplaceId: string };
}

async function register(userId: string, marketplaceId: string, product?: ProductInput) {
  const [user, marketplace] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.marketplace.findUnique({ where: { id: marketplaceId }, include: { operator: true } }),
  ]);
  if (!user?.isSeller) throw new SellerSetupError("Activate your seller profile first");
  const onChainId = marketplace ? boundOnChainId(marketplace) : null;
  const operator = marketplace ? operatorSignerOf(marketplace) : null;
  if (!marketplace || onChainId === null || !operator) {
    throw new SellerSetupError("Marketplace is not fully set up");
  }
  if (ownWalletPending(user)) throw new SellerSetupError("Finish setting up your wallet first");
  const personal = personalWallet(user);
  let payoutAddress: string;
  let sellerSecret: string | null = null;
  if (personal.kind === "none") {
    const account = await createCustodialAccount();
    await prisma.user.update({ where: { id: user.id }, data: { stellarPublicKey: account.publicKey, stellarSecretEncrypted: account.secretEncrypted } });
    payoutAddress = account.publicKey;
    sellerSecret = decryptSecret(account.secretEncrypted);
  } else {
    payoutAddress = personal.address;
    if (personal.kind === "custodial") sellerSecret = decryptSecret(personal.secretEncrypted);
  }
  let membership = await prisma.vendorMembership.upsert({
    where: { marketplaceId_userId: { marketplaceId, userId } },
    update: {},
    create: { marketplaceId, userId, sellsDescription: "" },
  });
  if (!membership.registerTxHash) {
    let txHash: string;
    if (operator.kind === "custodial") {
      ({ txHash } = await registerVendor({ operatorSecret: operator.secret, marketplaceId: onChainId, vendorPublicKey: payoutAddress }));
    } else if (sellerSecret) {
      ({ txHash } = await invokeCall(joinCall({ marketplaceId: onChainId, vendor: payoutAddress }), sellerSecret));
    } else {
      const prepared = await prepareCall(joinCall({ marketplaceId: onChainId, vendor: payoutAddress }), payoutAddress);
      const request = createPending<JoinContext>({
        kind: "join",
        userId,
        signer: payoutAddress,
        xdr: prepared.xdr,
        hash: prepared.hash,
        context: { membershipId: membership.id, payoutAddress, product: product ? { input: product, marketplaceId } : undefined },
      });
      return signatureRequest(request, `Join ${marketplace.name}`);
    }
    membership = await prisma.vendorMembership.update({ where: { id: membership.id }, data: { registerTxHash: txHash, payoutAddress } });
  }
  return membership;
}

/** True for the 202 answer that asks the seller's wallet to sign `join`. */
export function isSignatureRequest(value: unknown): value is ReturnType<typeof signatureRequest> {
  return typeof value === "object" && value !== null && "signatureRequired" in value;
}

/** Called by POST /api/tx/:id once the seller's wallet signed `join`. */
export async function completeJoin(pending: PendingTx, result: { txHash: string; returnValue: xdr.ScVal | undefined }) {
  const context = pending.context as JoinContext;
  await prisma.vendorMembership.update({
    where: { id: context.membershipId },
    data: { registerTxHash: result.txHash, payoutAddress: context.payoutAddress },
  });
  if (!context.product) return { registerTxHash: result.txHash };
  const product = await prisma.product.create({
    data: { ...context.product.input, marketplaceId: context.product.marketplaceId, vendorId: pending.userId },
  });
  return { product };
}
