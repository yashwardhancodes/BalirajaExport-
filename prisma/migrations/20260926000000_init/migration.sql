-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "shipment_status" AS ENUM ('quoted', 'confirmed', 'produced', 'shipped', 'completed');

-- CreateEnum
CREATE TYPE "cost_type" AS ENUM ('quoted', 'actual');

-- CreateEnum
CREATE TYPE "cost_stage" AS ENUM ('raw_material', 'factory_transport', 'sorting', 'packaging', 'pouch', 'carton', 'processing', 'port_transport', 'fob_charges', 'ocean_freight', 'other');

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'KG',
    "standard_pack_kg" DECIMAL(10,3),
    "default_pouches_per_carton" INTEGER,
    "default_sorting_loss_pct" DECIMAL(5,2),
    "category" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "location" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_rates" (
    "id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "rate_per_kg" DECIMAL(14,4) NOT NULL,
    "moq_kg" DECIMAL(14,3),
    "effective_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "contact" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "client_id" UUID,
    "status" "shipment_status" NOT NULL DEFAULT 'quoted',
    "incoterm" TEXT,
    "port_of_loading" TEXT,
    "port_of_discharge" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "exchange_rate" DECIMAL(12,4) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_items" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "supplier_id" UUID,
    "quantity_mt" DECIMAL(12,3) NOT NULL,
    "pouch_kg" DECIMAL(10,3) NOT NULL DEFAULT 2.5,
    "pouches_per_carton" INTEGER,
    "sorting_loss_pct_quoted" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sorting_loss_pct_actual" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_entries" (
    "id" UUID NOT NULL,
    "shipment_item_id" UUID NOT NULL,
    "stage" "cost_stage" NOT NULL,
    "cost_type" "cost_type" NOT NULL,
    "amount_per_kg" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "cost_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_prices" (
    "id" UUID NOT NULL,
    "shipment_item_id" UUID NOT NULL,
    "cost_type" "cost_type" NOT NULL,
    "selling_price_per_mt" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "quote_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_rates_product_id_supplier_id_effective_date_idx" ON "supplier_rates"("product_id", "supplier_id", "effective_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "shipments_code_key" ON "shipments"("code");

-- CreateIndex
CREATE INDEX "shipment_items_shipment_id_idx" ON "shipment_items"("shipment_id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_entries_shipment_item_id_stage_cost_type_key" ON "cost_entries"("shipment_item_id", "stage", "cost_type");

-- CreateIndex
CREATE UNIQUE INDEX "quote_prices_shipment_item_id_cost_type_key" ON "quote_prices"("shipment_item_id", "cost_type");

-- AddForeignKey
ALTER TABLE "supplier_rates" ADD CONSTRAINT "supplier_rates_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_rates" ADD CONSTRAINT "supplier_rates_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_shipment_item_id_fkey" FOREIGN KEY ("shipment_item_id") REFERENCES "shipment_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_prices" ADD CONSTRAINT "quote_prices_shipment_item_id_fkey" FOREIGN KEY ("shipment_item_id") REFERENCES "shipment_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Business rules Prisma can't express in schema.prisma (hand-added).
ALTER TABLE "products"
  ADD CONSTRAINT "products_standard_pack_kg_check" CHECK ("standard_pack_kg" > 0),
  ADD CONSTRAINT "products_default_pouches_per_carton_check" CHECK ("default_pouches_per_carton" > 0),
  ADD CONSTRAINT "products_default_sorting_loss_pct_check" CHECK ("default_sorting_loss_pct" >= 0 AND "default_sorting_loss_pct" < 100);

ALTER TABLE "shipment_items"
  ADD CONSTRAINT "shipment_items_quantity_mt_check" CHECK ("quantity_mt" > 0),
  ADD CONSTRAINT "shipment_items_pouch_kg_check" CHECK ("pouch_kg" > 0),
  ADD CONSTRAINT "shipment_items_pouches_per_carton_check" CHECK ("pouches_per_carton" > 0),
  ADD CONSTRAINT "shipment_items_sorting_loss_pct_quoted_check" CHECK ("sorting_loss_pct_quoted" >= 0 AND "sorting_loss_pct_quoted" < 100),
  ADD CONSTRAINT "shipment_items_sorting_loss_pct_actual_check" CHECK ("sorting_loss_pct_actual" >= 0 AND "sorting_loss_pct_actual" < 100);

ALTER TABLE "shipments"
  ADD CONSTRAINT "shipments_exchange_rate_check" CHECK ("exchange_rate" > 0);
