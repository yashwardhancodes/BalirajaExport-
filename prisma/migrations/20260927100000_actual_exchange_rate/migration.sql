-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "actual_exchange_rate" DECIMAL(12,4);

-- Hand-added: a realised rate must be positive.
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_actual_exchange_rate_check" CHECK ("actual_exchange_rate" > 0);
