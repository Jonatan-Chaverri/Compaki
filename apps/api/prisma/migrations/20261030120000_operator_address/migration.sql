-- The operator address registered in the contract. Every marketplace
-- registered so far used its owner's custodial account.
ALTER TABLE "Marketplace" ADD COLUMN "operatorAddress" TEXT;

UPDATE "Marketplace" SET "operatorAddress" = "User"."stellarPublicKey"
FROM "User"
WHERE "User"."id" = "Marketplace"."operatorId"
  AND "Marketplace"."contractMarketplaceId" IS NOT NULL;
