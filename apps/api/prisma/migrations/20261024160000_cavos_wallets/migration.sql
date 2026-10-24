-- Cavos email login + user-owned Stellar wallets (additive).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cavosAddress" TEXT,
ADD COLUMN     "cavosWalletReadyAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "VendorMembership" ADD COLUMN     "payoutAddress" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_cavosAddress_key" ON "User"("cavosAddress");

