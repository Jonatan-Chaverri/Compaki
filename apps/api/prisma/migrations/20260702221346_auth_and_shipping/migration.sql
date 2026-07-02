-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "shipAddress" TEXT,
ADD COLUMN     "shipCity" TEXT,
ADD COLUMN     "shipCountry" TEXT,
ADD COLUMN     "shipPostalCode" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "country" TEXT,
ADD COLUMN     "passwordHash" TEXT;
