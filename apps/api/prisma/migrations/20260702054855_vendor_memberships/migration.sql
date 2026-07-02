-- CreateTable
CREATE TABLE "VendorMembership" (
    "id" TEXT NOT NULL,
    "sellsDescription" TEXT NOT NULL DEFAULT '',
    "registerTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketplaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "VendorMembership_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VendorMembership_marketplaceId_fkey" FOREIGN KEY ("marketplaceId") REFERENCES "Marketplace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VendorMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorMembership_marketplaceId_userId_key" ON "VendorMembership"("marketplaceId", "userId");
