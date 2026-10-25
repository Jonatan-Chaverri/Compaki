-- Keep existing products public. Deleted products remain for order/sale history.
ALTER TABLE "Product" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE "Product" ADD CONSTRAINT "Product_visibility_check"
  CHECK ("visibility" IN ('PUBLISHED', 'HIDDEN', 'DELETED'));
