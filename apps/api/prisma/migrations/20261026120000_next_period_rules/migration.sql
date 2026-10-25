-- Rewards periods end with a distribution, where the operator may set the
-- next period's rules; fundraising rounds may get a new target. These
-- columns hold the operator's pending choice until that call. Fundraisers
-- no longer have a "direct" payout policy.

-- AlterTable
ALTER TABLE "Marketplace" ADD COLUMN     "rewardsNextVendorPoolBps" INTEGER,
ADD COLUMN     "rewardsNextPeriodSeconds" INTEGER,
ADD COLUMN     "fundraiseNextTargetUsd" DOUBLE PRECISION;

UPDATE "Marketplace" SET "fundraisePolicy" = 'new-round' WHERE "fundraisePolicy" = 'direct';

-- CreateTable
CREATE TABLE "RewardsDistribution" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "periodId" INTEGER NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "txHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketplaceId" TEXT NOT NULL,

    CONSTRAINT "RewardsDistribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RewardsDistribution_txHash_key" ON "RewardsDistribution"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "RewardsDistribution_marketplaceId_contractId_periodId_key" ON "RewardsDistribution"("marketplaceId", "contractId", "periodId");

-- AddForeignKey
ALTER TABLE "RewardsDistribution" ADD CONSTRAINT "RewardsDistribution_marketplaceId_fkey" FOREIGN KEY ("marketplaceId") REFERENCES "Marketplace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
