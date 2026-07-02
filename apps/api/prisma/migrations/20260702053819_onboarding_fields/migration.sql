-- AlterTable
ALTER TABLE "Marketplace" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'Other';
ALTER TABLE "Marketplace" ADD COLUMN "createTxHash" TEXT;
ALTER TABLE "Marketplace" ADD COLUMN "communityFundId" TEXT;

-- AddForeignKey
ALTER TABLE "Marketplace" ADD CONSTRAINT "Marketplace_communityFundId_fkey" FOREIGN KEY ("communityFundId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
