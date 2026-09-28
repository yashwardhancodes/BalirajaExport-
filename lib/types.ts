export type CostType = "quoted" | "actual";

export type ShipmentStatus =
  | "quoted"
  | "confirmed"
  | "produced"
  | "shipped"
  | "completed";

/**
 * Once a shipment leaves "quoted", its quoted figures are the baseline actuals are measured against,
 * so they're locked (enforced in lib/actions.ts). Moving back to "quoted" unlocks them.
 */
export function isQuoteLocked(status: ShipmentStatus): boolean {
  return status !== "quoted";
}

// Ordered to follow the goods: bulk from supplier -> packed at our cold storage hub -> port -> buyer.
// Keys are stored in cost_entries.stage, so rename labels freely but never the keys.
export const COST_STAGES = [
  "raw_material",
  "factory_transport",
  "sorting",
  "packaging",
  "pouch",
  "carton",
  "processing",
  "port_transport",
  "fob_charges",
  "ocean_freight",
  "other",
] as const;

export type CostStage = (typeof COST_STAGES)[number];

export const STAGE_LABELS: Record<CostStage, string> = {
  raw_material: "Bulk raw material",
  factory_transport: "Transport: supplier → hub",
  sorting: "Sorting",
  packaging: "Packaging labour",
  pouch: "Pouch",
  carton: "Export carton",
  processing: "Other hub processing",
  port_transport: "Transport: hub → Nhava Sheva",
  fob_charges: "FOB / port charges",
  ocean_freight: "Ocean freight",
  other: "Other shipment charges",
};

/**
 * Stages paid per kg of BULK material, i.e. before sorting loss. Sorting is charged on what goes
 * onto the sorting table, so it sits here too. Everything else is paid per kg of packed export goods.
 */
export const BULK_WEIGHT_STAGES: ReadonlySet<CostStage> = new Set<CostStage>(["raw_material", "factory_transport", "sorting"]);

/** Entered per shipment line, in ₹/kg. */
export const STAGE_GROUPS: { title: string; stages: CostStage[] }[] = [
  { title: "Bulk: supplier → hub → sorting (₹/kg of bulk)", stages: ["raw_material", "factory_transport", "sorting"] },
  {
    title: "Export packing at hub → Nhava Sheva (₹/kg packed)",
    stages: ["packaging", "pouch", "carton", "processing", "port_transport"],
  },
];

/** Paid once for the whole shipment as a ₹ total, then spread over its packed kg (see shipment_charges). */
export const SHIPMENT_CHARGE_STAGES: CostStage[] = ["fob_charges", "ocean_freight", "other"];

export const DEFAULT_POUCH_KG = 2.5;

export interface Product {
  id: string;
  name: string;
  unit: string;
  standard_pack_kg: number | null; // export pouch size, e.g. 2.5
  default_pouches_per_carton: number | null;
  default_sorting_loss_pct: number | null; // typical % of bulk rejected in sorting
  category: string | null;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string | null;
  location: string | null;
  created_at: string;
}

export interface SupplierRate {
  id: string;
  supplier_id: string;
  product_id: string;
  rate_per_kg: number;
  moq_kg: number | null;
  effective_date: string;
  notes: string | null;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  country: string | null;
  contact: string | null;
  created_at: string;
}

export interface Shipment {
  id: string;
  code: string;
  client_id: string | null;
  status: ShipmentStatus;
  incoterm: string | null;
  port_of_loading: string | null;
  port_of_discharge: string | null;
  currency: string;
  exchange_rate: number; // ₹ per 1 unit of currency — quoted figures
  actual_exchange_rate: number | null; // ₹ per 1 unit realised — actual figures; null = not known yet
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentItem {
  id: string;
  shipment_id: string;
  product_id: string;
  supplier_id: string | null;
  quantity_mt: number;
  pouch_kg: number; // net kg per export pouch, e.g. 2.5
  pouches_per_carton: number | null;
  sorting_loss_pct_quoted: number; // % of bulk weight rejected in sorting, e.g. 5 = 5%
  sorting_loss_pct_actual: number | null; // null until the real loss is recorded
  created_at: string;
}

export interface CostEntry {
  id: string;
  shipment_item_id: string;
  stage: CostStage;
  cost_type: CostType;
  amount_per_kg: number; // ₹ per kg as paid: bulk kg for BULK_WEIGHT_STAGES, packed kg otherwise
  notes: string | null;
}

export interface ShipmentCharge {
  id: string;
  shipment_id: string;
  stage: CostStage;
  cost_type: CostType;
  amount_total: number; // for the whole shipment, in `currency`
  currency: string; // "INR", the shipment's currency, or any other ISO code
  exchange_rate: number | null; // ₹ per 1 unit; null = INR or same as shipment (uses the shipment's rate)
}

export const BASE_CURRENCY = "INR";
export const COMMON_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"];

export interface QuotePrice {
  id: string;
  shipment_item_id: string;
  cost_type: CostType;
  selling_price_per_mt: number;
}
