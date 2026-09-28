-- CreateTable
CREATE TABLE "shipment_charges" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "stage" "cost_stage" NOT NULL,
    "cost_type" "cost_type" NOT NULL,
    "amount_total" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "shipment_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipment_charges_shipment_id_stage_cost_type_key" ON "shipment_charges"("shipment_id", "stage", "cost_type");

-- AddForeignKey
ALTER TABLE "shipment_charges" ADD CONSTRAINT "shipment_charges_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-added: totals can't be negative, and only port & freight stages are charged per shipment.
ALTER TABLE "shipment_charges"
  ADD CONSTRAINT "shipment_charges_amount_total_check" CHECK ("amount_total" >= 0),
  ADD CONSTRAINT "shipment_charges_stage_check" CHECK ("stage" IN ('fob_charges', 'ocean_freight', 'other'));
