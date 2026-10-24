ALTER TABLE "Marketplace"
ADD COLUMN "communityPurpose" TEXT NOT NULL DEFAULT '',
ADD COLUMN "communityBeneficiaries" TEXT NOT NULL DEFAULT '',
ADD COLUMN "communityDistribution" TEXT NOT NULL DEFAULT '',
ADD COLUMN "communityGoalUsd" DOUBLE PRECISION,
ADD COLUMN "communityDetailsUpdatedAt" TIMESTAMP(3);
