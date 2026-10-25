import { prisma } from "./db";
import { boundOnChainId } from "./rewards";
import { SellerSetupError } from "./seller-errors";
import { createCustodialAccount, decryptSecret, registerVendor } from "./stellar";
import { ownWalletPending, personalWallet } from "./wallets";

// The account is enabled globally. Only its payment registration is per market;
// publishing handles that automatically, including retries after a failure.
// Serialize setup for one user so concurrent first publications share an account.
const pending = new Map<string, Promise<unknown>>();
export async function ensureMarketplaceVendor(userId: string, marketplaceId: string) {
  const previous = pending.get(userId) ?? Promise.resolve();
  const task = previous.catch(() => {}).then(() => register(userId, marketplaceId));
  pending.set(userId, task);
  try { return await task; }
  finally { if (pending.get(userId) === task) pending.delete(userId); }
}

async function register(userId: string, marketplaceId: string) {
  const [user, marketplace] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.marketplace.findUnique({ where: { id: marketplaceId }, include: { operator: true } }),
  ]);
  if (!user?.isSeller) throw new SellerSetupError("Activate your seller profile first");
  const onChainId = marketplace ? boundOnChainId(marketplace) : null;
  if (!marketplace || onChainId === null || !marketplace.operator.stellarSecretEncrypted) {
    throw new SellerSetupError("Marketplace is not fully set up");
  }
  if (ownWalletPending(user)) throw new SellerSetupError("Finish setting up your wallet first");
  const personal = personalWallet(user);
  let payoutAddress: string;
  if (personal.kind === "none") {
    const account = await createCustodialAccount();
    await prisma.user.update({ where: { id: user.id }, data: { stellarPublicKey: account.publicKey, stellarSecretEncrypted: account.secretEncrypted } });
    payoutAddress = account.publicKey;
  } else {
    payoutAddress = personal.address;
  }
  let membership = await prisma.vendorMembership.upsert({
    where: { marketplaceId_userId: { marketplaceId, userId } },
    update: {},
    create: { marketplaceId, userId, sellsDescription: "" },
  });
  if (!membership.registerTxHash) {
    const { txHash } = await registerVendor({ operatorSecret: decryptSecret(marketplace.operator.stellarSecretEncrypted), marketplaceId: onChainId, vendorPublicKey: payoutAddress });
    membership = await prisma.vendorMembership.update({ where: { id: membership.id }, data: { registerTxHash: txHash, payoutAddress } });
  }
  return membership;
}
