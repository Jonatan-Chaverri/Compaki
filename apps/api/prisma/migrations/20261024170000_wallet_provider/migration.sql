-- Own Stellar wallets from any provider (Cavos or an existing wallet).
-- Additive: Prisma fields walletAddress/walletReadyAt map onto the existing
-- cavosAddress/cavosWalletReadyAt columns; only walletProvider is new.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "walletProvider" TEXT;

