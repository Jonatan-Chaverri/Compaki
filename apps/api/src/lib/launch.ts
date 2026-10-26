// Last step of launching a marketplace: record its on-chain registration and
// build the "your marketplace is live" payload. The owner's wallet signs the
// create_* call in the browser; then POST /api/tx/:id finishes here.

import type { xdr } from "@stellar/stellar-sdk";

import { prisma } from "@/lib/db";
import type { PendingTx } from "@/lib/pending-tx";
import { communityModeOf } from "@/lib/rewards";
import { getRewardsStatus, marketplaceIdOf, stellarConfig, stellarExpertTxUrl } from "@/lib/stellar";

export interface LaunchContext {
  /** Postgres id of the marketplace row being launched. */
  marketplaceId: string;
}

export async function finishLaunch(
  marketplaceId: string,
  registration: { contractMarketplaceId: string; createTxHash: string | null; operatorAddress: string },
) {
  const marketplace = await prisma.marketplace.findUniqueOrThrow({ where: { id: marketplaceId } });
  // Periods are counted from the ledger time the contract recorded.
  let rewardsStartAt = marketplace.rewardsStartAt;
  if (communityModeOf(marketplace) === "rewards" && !rewardsStartAt) {
    const status = await getRewardsStatus(BigInt(registration.contractMarketplaceId));
    rewardsStartAt = new Date(status.periodStart * 1000);
  }
  const stored = await prisma.marketplace.update({
    where: { id: marketplaceId },
    data: {
      contractMarketplaceId: registration.contractMarketplaceId,
      createTxHash: registration.createTxHash,
      contractId: stellarConfig.marketplaceContractId,
      operatorAddress: registration.operatorAddress,
      rewardsStartAt,
    },
  });
  return {
    id: stored.id,
    name: stored.name,
    slug: stored.slug,
    url: `compaki.app/m/${stored.slug}`,
    path: `/m/${stored.slug}`,
    dashboardPath: `/dashboard/${stored.slug}`,
    verifyUrl: stored.createTxHash ? stellarExpertTxUrl(stored.createTxHash) : null,
  };
}

/** Called by POST /api/tx/:id once the owner's wallet signed the create_* call. */
export async function completeLaunch(
  pending: PendingTx,
  result: { txHash: string; returnValue: xdr.ScVal | undefined },
) {
  const { marketplaceId } = pending.context as LaunchContext;
  const marketplace = await finishLaunch(marketplaceId, {
    contractMarketplaceId: marketplaceIdOf(result.returnValue).toString(),
    createTxHash: result.txHash,
    operatorAddress: pending.signer,
  });
  return { complete: { marketplace } };
}
