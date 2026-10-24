-- Community Rewards v1.
-- Additive except for one index swap: contractMarketplaceId becomes unique per
-- (contractId, contractMarketplaceId) because on-chain ids restart at 0 in a
-- new contract deployment. Existing rows get contractId = NULL and must be
-- bound with `npm run marketplaces:rebind` (see README "Migrating").

-- DropIndex
DROP INDEX "Marketplace_contractMarketplaceId_key";

-- AlterTable
ALTER TABLE "Marketplace" ADD COLUMN     "contractId" TEXT,
ADD COLUMN     "rewardsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RewardsPeriod" (
    "id" TEXT NOT NULL,
    "periodId" INTEGER NOT NULL,
    "contractId" TEXT NOT NULL,
    "openTxHash" TEXT,
    "closeTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketplaceId" TEXT NOT NULL,

    CONSTRAINT "RewardsPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardClaim" (
    "id" TEXT NOT NULL,
    "memberAddress" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "txHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodRowId" TEXT NOT NULL,

    CONSTRAINT "RewardClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RewardsPeriod_marketplaceId_contractId_periodId_key" ON "RewardsPeriod"("marketplaceId", "contractId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "RewardClaim_txHash_key" ON "RewardClaim"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "RewardClaim_periodRowId_memberAddress_key" ON "RewardClaim"("periodRowId", "memberAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Marketplace_contractId_contractMarketplaceId_key" ON "Marketplace"("contractId", "contractMarketplaceId");

-- AddForeignKey
ALTER TABLE "RewardsPeriod" ADD CONSTRAINT "RewardsPeriod_marketplaceId_fkey" FOREIGN KEY ("marketplaceId") REFERENCES "Marketplace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardClaim" ADD CONSTRAINT "RewardClaim_periodRowId_fkey" FOREIGN KEY ("periodRowId") REFERENCES "RewardsPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

