-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Marketplace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'Other',
    "splitVendorBps" INTEGER NOT NULL DEFAULT 9000,
    "splitOperatorBps" INTEGER NOT NULL DEFAULT 1000,
    "splitCommunityBps" INTEGER NOT NULL DEFAULT 0,
    "contractMarketplaceId" TEXT,
    "createTxHash" TEXT,
    "regenerativeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operatorId" TEXT NOT NULL,
    "communityFundId" TEXT,
    CONSTRAINT "Marketplace_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Marketplace_communityFundId_fkey" FOREIGN KEY ("communityFundId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Marketplace" ("contractMarketplaceId", "createdAt", "description", "id", "name", "operatorId", "regenerativeEnabled", "slug", "splitCommunityBps", "splitOperatorBps", "splitVendorBps") SELECT "contractMarketplaceId", "createdAt", "description", "id", "name", "operatorId", "regenerativeEnabled", "slug", "splitCommunityBps", "splitOperatorBps", "splitVendorBps" FROM "Marketplace";
DROP TABLE "Marketplace";
ALTER TABLE "new_Marketplace" RENAME TO "Marketplace";
CREATE UNIQUE INDEX "Marketplace_slug_key" ON "Marketplace"("slug");
CREATE UNIQUE INDEX "Marketplace_contractMarketplaceId_key" ON "Marketplace"("contractMarketplaceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
