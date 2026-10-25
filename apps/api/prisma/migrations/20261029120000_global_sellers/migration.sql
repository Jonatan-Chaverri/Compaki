ALTER TABLE "User" ADD COLUMN "isSeller" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User" SET "isSeller" = true
WHERE "role" = 'VENDOR'
   OR EXISTS (SELECT 1 FROM "VendorMembership" WHERE "userId" = "User"."id")
   OR EXISTS (SELECT 1 FROM "Product" WHERE "vendorId" = "User"."id");
