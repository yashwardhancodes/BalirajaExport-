"use server";

// Every database read/write the UI makes goes through here. These run on the server only,
// so DATABASE_URL never reaches the browser.

import { prisma, toPlain } from "@/lib/db";
import type {
  Client,
  CostEntry,
  CostStage,
  CostType,
  Product,
  QuotePrice,
  Shipment,
  ShipmentCharge,
  ShipmentItem,
  ShipmentStatus,
  Supplier,
  SupplierRate,
} from "@/lib/types";
import { isQuoteLocked, SHIPMENT_CHARGE_STAGES } from "@/lib/types";

// ---------- Products ----------

export async function listProducts(): Promise<Product[]> {
  return toPlain(await prisma.product.findMany({ orderBy: { name: "asc" } }));
}

export async function createProduct(data: {
  name: string;
  unit: string;
  standard_pack_kg: number | null;
  default_pouches_per_carton: number | null;
  default_sorting_loss_pct: number | null;
  category: string | null;
}): Promise<void> {
  await prisma.product.create({ data });
}

export async function updateProduct(
  id: string,
  data: {
    name: string;
    unit: string;
    standard_pack_kg: number | null;
    default_pouches_per_carton: number | null;
    default_sorting_loss_pct: number | null;
    category: string | null;
  }
): Promise<void> {
  await prisma.product.update({ where: { id }, data });
}

export async function deleteProduct(id: string): Promise<void> {
  await prisma.product.delete({ where: { id } });
}

// ---------- Suppliers & rate book ----------

export async function listSuppliers(): Promise<Supplier[]> {
  return toPlain(await prisma.supplier.findMany({ orderBy: { name: "asc" } }));
}

export async function createSupplier(data: { name: string; contact: string | null; location: string | null }): Promise<void> {
  await prisma.supplier.create({ data });
}

/** Newest first, so the first match for a supplier+product is its current rate. */
export async function listSupplierRates(): Promise<SupplierRate[]> {
  const rates = await prisma.supplierRate.findMany({ orderBy: [{ effective_date: "desc" }, { created_at: "desc" }] });
  return rates.map((r) => ({ ...toPlain(r), effective_date: r.effective_date.toISOString().slice(0, 10) }));
}

export async function createSupplierRate(data: {
  supplier_id: string;
  product_id: string;
  rate_per_kg: number;
  moq_kg: number | null;
  effective_date: string; // YYYY-MM-DD
  notes: string | null;
}): Promise<void> {
  await prisma.supplierRate.create({ data: { ...data, effective_date: new Date(`${data.effective_date}T00:00:00Z`) } });
}

// ---------- Clients ----------

export async function listClients(): Promise<Client[]> {
  return toPlain(await prisma.client.findMany({ orderBy: { name: "asc" } }));
}

export async function createClient(data: { name: string; country: string | null; contact: string | null }): Promise<void> {
  await prisma.client.create({ data });
}

// ---------- Shipments ----------

export async function listShipments(): Promise<Shipment[]> {
  return toPlain(await prisma.shipment.findMany({ orderBy: { created_at: "desc" } }));
}

export async function getShipment(id: string): Promise<Shipment | null> {
  return toPlain(await prisma.shipment.findUnique({ where: { id } }));
}

export async function createShipment(data: {
  code: string;
  client_id: string | null;
  incoterm: string | null;
  port_of_loading: string | null;
  port_of_discharge: string | null;
  currency: string;
  exchange_rate: number;
}): Promise<string> {
  const { id } = await prisma.shipment.create({ data: { ...data, currency: data.currency.trim().toUpperCase() } });
  return id;
}

// ---------- Quote lock ----------

/**
 * Quoted figures are the baseline actuals are measured against, so they can't change once a shipment
 * is confirmed. Every action that writes a quoted figure calls this first.
 */
async function assertQuoteEditable(shipmentId: string): Promise<void> {
  const { status } = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId }, select: { status: true } });
  if (isQuoteLocked(status)) {
    throw new Error(`Quoted figures are locked because this shipment is ${status}. Move it back to Quoted to change them.`);
  }
}

async function shipmentIdOfItem(itemId: string): Promise<string> {
  const { shipment_id } = await prisma.shipmentItem.findUniqueOrThrow({ where: { id: itemId }, select: { shipment_id: true } });
  return shipment_id;
}

/**
 * Deal currency, quoted rate and realised rate (₹ per 1 unit). The quoted rate and currency are part of the
 * quote, so they lock with it; the realised rate can be set any time.
 */
export async function updateShipmentFx(
  id: string,
  data: { currency: string; exchange_rate: number; actual_exchange_rate: number | null }
): Promise<void> {
  const currency = data.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`"${data.currency}" isn't a 3-letter currency code`);
  if (!(data.exchange_rate > 0)) throw new Error("Quoted exchange rate must be above 0");
  if (data.actual_exchange_rate !== null && !(data.actual_exchange_rate > 0)) {
    throw new Error("Realised exchange rate must be above 0, or left blank");
  }
  const current = await prisma.shipment.findUniqueOrThrow({ where: { id } });
  if (currency !== current.currency || data.exchange_rate !== current.exchange_rate.toNumber()) {
    await assertQuoteEditable(id);
  }
  await prisma.shipment.update({
    where: { id },
    data: { currency, exchange_rate: data.exchange_rate, actual_exchange_rate: data.actual_exchange_rate },
  });
}

export async function updateShipmentStatus(id: string, status: ShipmentStatus): Promise<void> {
  await prisma.shipment.update({ where: { id }, data: { status } });
}

// ---------- Shipment lines, costs, prices ----------

/** All lines, or just one shipment's. */
export async function listShipmentItems(shipmentId?: string): Promise<ShipmentItem[]> {
  return toPlain(
    await prisma.shipmentItem.findMany({
      where: shipmentId ? { shipment_id: shipmentId } : undefined,
      orderBy: { created_at: "asc" },
    })
  );
}

export async function listCostEntries(itemIds?: string[]): Promise<CostEntry[]> {
  return toPlain(await prisma.costEntry.findMany({ where: itemIds ? { shipment_item_id: { in: itemIds } } : undefined }));
}

export async function listQuotePrices(itemIds?: string[]): Promise<QuotePrice[]> {
  return toPlain(await prisma.quotePrice.findMany({ where: itemIds ? { shipment_item_id: { in: itemIds } } : undefined }));
}

/** Port & freight totals: all shipments, or just one. */
export async function listShipmentCharges(shipmentId?: string): Promise<ShipmentCharge[]> {
  return toPlain(await prisma.shipmentCharge.findMany({ where: shipmentId ? { shipment_id: shipmentId } : undefined }));
}

/** Saves one side (quoted or actual) of a shipment's port & freight totals, each in its own currency. */
export async function saveShipmentCharges(
  shipmentId: string,
  costType: CostType,
  charges: { stage: CostStage; amount_total: number; currency: string; exchange_rate: number | null }[]
): Promise<void> {
  for (const c of charges) {
    if (!SHIPMENT_CHARGE_STAGES.includes(c.stage)) throw new Error(`${c.stage} is not a shipment-level charge`);
    if (!(c.amount_total >= 0)) throw new Error(`Amount for ${c.stage} can't be negative`);
    if (!/^[A-Z]{3}$/.test(c.currency)) throw new Error(`"${c.currency}" isn't a 3-letter currency code`);
    if (c.exchange_rate !== null && !(c.exchange_rate > 0)) throw new Error(`Exchange rate for ${c.currency} must be above 0`);
  }
  if (costType === "quoted") await assertQuoteEditable(shipmentId);
  await prisma.$transaction(
    charges.map(({ stage, amount_total, currency, exchange_rate }) =>
      prisma.shipmentCharge.upsert({
        where: { shipment_id_stage_cost_type: { shipment_id: shipmentId, stage, cost_type: costType } },
        create: { shipment_id: shipmentId, stage, cost_type: costType, amount_total, currency, exchange_rate },
        update: { amount_total, currency, exchange_rate },
      })
    )
  );
}

/** Adds a line and, if the supplier has a rate on file, starts the quote with it as the raw material cost. */
export async function createShipmentItem(data: {
  shipment_id: string;
  product_id: string;
  supplier_id: string | null;
  quantity_mt: number;
  pouch_kg: number;
  pouches_per_carton: number | null;
  sorting_loss_pct_quoted: number;
}): Promise<void> {
  await assertQuoteEditable(data.shipment_id); // a new line changes the quote
  await prisma.$transaction(async (tx) => {
    const item = await tx.shipmentItem.create({ data });
    if (!data.supplier_id) return;
    const rate = await tx.supplierRate.findFirst({
      where: { supplier_id: data.supplier_id, product_id: data.product_id },
      orderBy: [{ effective_date: "desc" }, { created_at: "desc" }],
    });
    if (rate) {
      await tx.costEntry.create({
        data: { shipment_item_id: item.id, stage: "raw_material", cost_type: "quoted", amount_per_kg: rate.rate_per_kg },
      });
    }
  });
}

export async function deleteShipmentItem(id: string): Promise<void> {
  await assertQuoteEditable(await shipmentIdOfItem(id)); // removing a line deletes its quoted figures
  await prisma.shipmentItem.delete({ where: { id } }); // cost entries & prices cascade
}

/** Saves one side (quoted or actual) of a line in one transaction: pack spec + loss, every stage cost, selling price. */
export async function saveItemFigures(input: {
  itemId: string;
  costType: CostType;
  item: {
    pouch_kg: number;
    pouches_per_carton: number | null;
    sorting_loss_pct_quoted?: number;
    sorting_loss_pct_actual?: number | null;
  };
  costs: { stage: CostStage; amount_per_kg: number }[];
  sellingPricePerMT: number;
}): Promise<void> {
  const { itemId, costType } = input;
  // Each side only writes its own loss; the quoted side is refused once the quote is locked.
  const { sorting_loss_pct_quoted, sorting_loss_pct_actual, ...pack } = input.item;
  const itemData =
    costType === "quoted" ? { ...pack, sorting_loss_pct_quoted } : { ...pack, sorting_loss_pct_actual };
  if (costType === "quoted") await assertQuoteEditable(await shipmentIdOfItem(itemId));
  await prisma.$transaction([
    prisma.shipmentItem.update({ where: { id: itemId }, data: itemData }),
    ...input.costs.map(({ stage, amount_per_kg }) =>
      prisma.costEntry.upsert({
        where: { shipment_item_id_stage_cost_type: { shipment_item_id: itemId, stage, cost_type: costType } },
        create: { shipment_item_id: itemId, stage, cost_type: costType, amount_per_kg },
        update: { amount_per_kg },
      })
    ),
    prisma.quotePrice.upsert({
      where: { shipment_item_id_cost_type: { shipment_item_id: itemId, cost_type: costType } },
      create: { shipment_item_id: itemId, cost_type: costType, selling_price_per_mt: input.sellingPricePerMT },
      update: { selling_price_per_mt: input.sellingPricePerMT },
    }),
  ]);
}
