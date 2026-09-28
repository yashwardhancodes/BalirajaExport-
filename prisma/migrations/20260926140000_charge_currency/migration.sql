-- AlterTable
ALTER TABLE "shipment_charges" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "exchange_rate" DECIMAL(12,4);

-- Hand-added: rates must be positive; currency is a 3-letter code.
ALTER TABLE "shipment_charges"
  ADD CONSTRAINT "shipment_charges_exchange_rate_check" CHECK ("exchange_rate" > 0),
  ADD CONSTRAINT "shipment_charges_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');
