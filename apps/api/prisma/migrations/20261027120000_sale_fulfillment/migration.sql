-- Order fulfilment, tracked per sale (one sale per order item).
ALTER TABLE "Sale" ADD COLUMN "fulfillmentStatus" TEXT NOT NULL DEFAULT 'PAID',
ADD COLUMN "trackingInfo" TEXT,
ADD COLUMN "shippedAt" TIMESTAMP(3),
ADD COLUMN "deliveredAt" TIMESTAMP(3);
