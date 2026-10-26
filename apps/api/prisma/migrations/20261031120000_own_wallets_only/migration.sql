-- Every account signs with its own wallet (Cavos or an existing Stellar
-- wallet); Compaki no longer keeps Stellar keys or passwords. A classic
-- marketplace names the wallet that receives its community share instead of
-- using a server-held fund account.
ALTER TABLE "Marketplace" ADD COLUMN "communityFundAddress" TEXT,
ADD COLUMN "communityFundName" TEXT;

-- Keep showing where earlier classic marketplaces sent their community share.
UPDATE "Marketplace" SET "communityFundAddress" = "User"."stellarPublicKey", "communityFundName" = "User"."name"
FROM "User"
WHERE "User"."id" = "Marketplace"."communityFundId";

ALTER TABLE "Marketplace" DROP CONSTRAINT "Marketplace_communityFundId_fkey";
ALTER TABLE "Marketplace" DROP COLUMN "communityFundId";

-- Fund accounts were only referenced by their marketplace.
DELETE FROM "User" WHERE "role" = 'COMMUNITY';

DROP INDEX "User_stellarPublicKey_key";
ALTER TABLE "User" DROP COLUMN "passwordHash",
DROP COLUMN "stellarPublicKey",
DROP COLUMN "stellarSecretEncrypted";
