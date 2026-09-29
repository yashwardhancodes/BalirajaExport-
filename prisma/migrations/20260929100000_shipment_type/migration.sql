-- CreateEnum
CREATE TYPE "shipment_type" AS ENUM ('export', 'domestic');

-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "delivery_location" TEXT,
ADD COLUMN     "type" "shipment_type" NOT NULL DEFAULT 'export';

-- Hand-added: domestic shipments are priced in rupees, so their rate is always 1 and there is no realised rate.
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_domestic_inr_check"
  CHECK ("type" <> 'domestic' OR ("currency" = 'INR' AND "exchange_rate" = 1 AND "actual_exchange_rate" IS NULL));
