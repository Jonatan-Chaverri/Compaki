-- Community modes: classic / rewards / fundraise.
-- Rewards are now shared automatically between each period's vendors and
-- buyers, so the operator-opened periods and their claims are dropped (they
-- belong to the previous contract deployment). Rebind marketplaces to the
-- new contract with `npm run marketplaces:rebind` (see README "Migrating").

-- AlterTable
ALTER TABLE "Marketplace" ADD COLUMN     "communityMode" TEXT NOT NULL DEFAULT 'classic',
ADD COLUMN     "rewardsPeriodSeconds" INTEGER,
ADD COLUMN     "rewardsVendorPoolBps" INTEGER,
ADD COLUMN     "rewardsStartAt" TIMESTAMP(3),
ADD COLUMN     "fundraisePolicy" TEXT,
ADD COLUMN     "fundraiseRecipients" JSONB;

UPDATE "Marketplace" SET "communityMode" = 'rewards' WHERE "rewardsEnabled" = true;

ALTER TABLE "Marketplace" DROP COLUMN "rewardsEnabled";

-- DropTable
DROP TABLE "RewardClaim";
DROP TABLE "RewardsPeriod";

-- CreateTable
CREATE TABLE "RewardClaim" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "periodId" INTEGER NOT NULL,
    "memberAddress" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "txHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketplaceId" TEXT NOT NULL,

    CONSTRAINT "RewardClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundraiseRelease" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "txHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketplaceId" TEXT NOT NULL,

    CONSTRAINT "FundraiseRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RewardClaim_txHash_key" ON "RewardClaim"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "RewardClaim_marketplaceId_contractId_periodId_memberAddress_key" ON "RewardClaim"("marketplaceId", "contractId", "periodId", "memberAddress");

-- CreateIndex
CREATE UNIQUE INDEX "FundraiseRelease_txHash_key" ON "FundraiseRelease"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "FundraiseRelease_marketplaceId_contractId_round_key" ON "FundraiseRelease"("marketplaceId", "contractId", "round");

-- AddForeignKey
ALTER TABLE "RewardClaim" ADD CONSTRAINT "RewardClaim_marketplaceId_fkey" FOREIGN KEY ("marketplaceId") REFERENCES "Marketplace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundraiseRelease" ADD CONSTRAINT "FundraiseRelease_marketplaceId_fkey" FOREIGN KEY ("marketplaceId") REFERENCES "Marketplace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
