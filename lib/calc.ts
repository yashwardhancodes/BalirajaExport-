import {
  BASE_CURRENCY,
  BULK_WEIGHT_STAGES,
  CostEntry,
  CostStage,
  CostType,
  Shipment,
  SHIPMENT_CHARGE_STAGES,
  ShipmentCharge,
  ShipmentItem,
} from "./types";

/**
 * This is the ONE calculation engine for the whole app.
 * Every cost/margin figure shown anywhere (dashboard, shipment detail,
 * PDFs later) must go through these functions so numbers can never
 * drift apart the way they did in the old spreadsheets.
 *
 * All costs are paid per kg. Bulk-stage costs are paid on bulk kg, but we sell packed kg,
 * so they are grossed up for sorting loss: 5% loss means 1 packed kg needs 1/0.95 = 1.0526 bulk kg.
 */

export type PackSpec = Pick<ShipmentItem, "pouch_kg" | "pouches_per_carton">;

/** Sorting loss % for the quoted or actual side. Actual falls back to quoted until the real loss is recorded. */
export function sortingLossPct(item: Pick<ShipmentItem, "sorting_loss_pct_quoted" | "sorting_loss_pct_actual">, costType: CostType): number {
  const pct = costType === "actual" ? item.sorting_loss_pct_actual ?? item.sorting_loss_pct_quoted : item.sorting_loss_pct_quoted;
  return pct ?? 0;
}

/** Bulk kg that must be bought and sorted to end up with 1 kg of packed export goods. */
export function bulkKgPerPackedKg(lossPct: number): number {
  if (!isFinite(lossPct) || lossPct <= 0) return 1;
  if (lossPct >= 100) return Infinity;
  return 1 / (1 - lossPct / 100);
}

/** ₹ per packed kg for a cost paid at `amountPerKg` at this stage. */
export function perPackedKg(stage: CostStage, amountPerKg: number, lossPct: number): number {
  return BULK_WEIGHT_STAGES.has(stage) ? amountPerKg * bulkKgPerPackedKg(lossPct) : amountPerKg;
}

export interface PackCounts {
  pouches: number;
  cartons: number | null;
  kgPerCarton: number | null;
  bulkKgNeeded: number;
}

/** Pouches/cartons for a line, and bulk kg to buy. Partial units round up — you still buy a whole pouch. */
export function computePackCounts(quantityMT: number, spec: PackSpec, lossPct: number): PackCounts {
  const packedKg = quantityMT * 1000;
  const pouches = spec.pouch_kg > 0 ? Math.ceil(packedKg / spec.pouch_kg) : 0;
  const cartons = spec.pouches_per_carton ? Math.ceil(pouches / spec.pouches_per_carton) : null;
  const kgPerCarton = spec.pouches_per_carton ? spec.pouch_kg * spec.pouches_per_carton : null;
  return { pouches, cartons, kgPerCarton, bulkKgNeeded: packedKg * bulkKgPerPackedKg(lossPct) };
}

export interface CostBreakdown {
  costType: CostType;
  perKgByStage: Record<string, number>;
  totalPerKgINR: number;
  totalPerMTINR: number;
  totalPerMTFx: number; // in the shipment's quote currency
}

export type ChargesPerKg = Partial<Record<CostStage, number>>;

export type ShipmentFx = Pick<Shipment, "currency" | "exchange_rate" | "actual_exchange_rate">;

/**
 * ₹ per 1 unit of the deal currency for one side: quoted uses the quoted rate; actual uses the realised
 * rate once it's known, else the quoted rate.
 */
export function rateFor(shipment: ShipmentFx, costType: CostType): number {
  if (costType === "actual" && shipment.actual_exchange_rate && shipment.actual_exchange_rate > 0) {
    return shipment.actual_exchange_rate;
  }
  return shipment.exchange_rate;
}

/**
 * ₹ per 1 unit of a charge's currency. INR is 1; the shipment's own currency uses the shipment's rate for that
 * side (so editing it re-prices the charge); any other currency uses the rate stored on the charge.
 * Returns 0 when no usable rate exists, so a missing rate shows up as a zero cost rather than a wrong one.
 */
export function chargeRateToINR(
  charge: Pick<ShipmentCharge, "currency" | "exchange_rate">,
  shipment: ShipmentFx,
  costType: CostType
): number {
  if (charge.currency === BASE_CURRENCY) return 1;
  if (charge.exchange_rate && charge.exchange_rate > 0) return charge.exchange_rate;
  if (charge.currency === shipment.currency) return rateFor(shipment, costType);
  return 0;
}

/**
 * Spread a shipment's port & freight totals over all its packed kg (in ₹), so each line carries its share by weight.
 * e.g. ₹1,20,000 ocean freight on 24 MT packed = ₹5/kg on every line.
 */
export function shipmentChargesPerKg(
  charges: Pick<ShipmentCharge, "stage" | "cost_type" | "amount_total" | "currency" | "exchange_rate">[],
  costType: CostType,
  items: Pick<ShipmentItem, "quantity_mt">[],
  shipment: ShipmentFx
): ChargesPerKg {
  const packedKg = items.reduce((sum, it) => sum + it.quantity_mt * 1000, 0);
  const perKg: ChargesPerKg = {};
  if (packedKg <= 0) return perKg;
  for (const c of charges) {
    if (c.cost_type !== costType || !SHIPMENT_CHARGE_STAGES.includes(c.stage)) continue;
    perKg[c.stage] = (perKg[c.stage] ?? 0) + (c.amount_total * chargeRateToINR(c, shipment, costType)) / packedKg;
  }
  return perKg;
}

/**
 * Total cost to us for one line (quoted or actual): its own ₹/kg entries (bulk stages grossed up for sorting loss)
 * plus its share of the shipment's port & freight charges. Result is ₹ per packed kg / MT, and per MT in the deal currency.
 */
export function computeCostBreakdown(
  entries: Pick<CostEntry, "stage" | "cost_type" | "amount_per_kg">[],
  costType: CostType,
  exchangeRate: number,
  lossPct: number,
  chargesPerKg: ChargesPerKg = {}
): CostBreakdown {
  const perKgByStage: Record<string, number> = {};
  let totalPerKgINR = 0;
  const add = (stage: CostStage, perKg: number) => {
    perKgByStage[stage] = (perKgByStage[stage] ?? 0) + perKg;
    totalPerKgINR += perKg;
  };

  for (const e of entries) {
    // Shipment-level stages come only from chargesPerKg, so a stray line entry can't double count.
    if (e.cost_type !== costType || SHIPMENT_CHARGE_STAGES.includes(e.stage)) continue;
    add(e.stage, perPackedKg(e.stage, e.amount_per_kg, lossPct));
  }
  for (const [stage, perKg] of Object.entries(chargesPerKg) as [CostStage, number][]) add(stage, perKg);

  const totalPerMTINR = totalPerKgINR * 1000;
  const totalPerMTFx = exchangeRate ? totalPerMTINR / exchangeRate : 0;

  return { costType, perKgByStage, totalPerKgINR, totalPerMTINR, totalPerMTFx };
}

export interface MarginResult {
  costType: CostType;
  sellingPricePerMT: number;
  costPerMTFx: number;
  marginPerMT: number;
  marginPct: number;
  quantityMT: number;
  totalMargin: number;
}

/**
 * Price that gives `marginPct` margin on the selling price (the same definition computeMargin reports):
 * price = cost / (1 − margin%). e.g. cost $1,000/MT at 20% margin → $1,250/MT.
 */
export function suggestSellingPrice(costPerMTFx: number, marginPct: number): number {
  if (!isFinite(marginPct) || marginPct >= 100 || costPerMTFx <= 0) return 0;
  return costPerMTFx / (1 - marginPct / 100);
}

/** Margin = client selling price (fx) - actual/quoted cost (fx), for a given quantity. */
export function computeMargin(
  breakdown: CostBreakdown,
  sellingPricePerMT: number,
  quantityMT: number
): MarginResult {
  const costPerMTFx = breakdown.totalPerMTFx;
  const marginPerMT = sellingPricePerMT - costPerMTFx;
  const marginPct = sellingPricePerMT ? (marginPerMT / sellingPricePerMT) * 100 : 0;
  const totalMargin = marginPerMT * quantityMT;

  return {
    costType: breakdown.costType,
    sellingPricePerMT,
    costPerMTFx,
    marginPerMT,
    marginPct,
    quantityMT,
    totalMargin,
  };
}

export interface LineResult extends MarginResult {
  rate: number; // ₹ per 1 unit of deal currency used
  totalMarginINR: number;
}

/**
 * Everything for one saved shipment line on one side, in one call — what the dashboard (and any report) should use.
 * `rate` defaults to rateFor(); pass another rate to ask "what if it had been paid at X?" (see fxEffectINR).
 */
export function computeLineResult(args: {
  item: Pick<ShipmentItem, "quantity_mt" | "sorting_loss_pct_quoted" | "sorting_loss_pct_actual">;
  entries: Pick<CostEntry, "stage" | "cost_type" | "amount_per_kg">[];
  charges: Pick<ShipmentCharge, "stage" | "cost_type" | "amount_total" | "currency" | "exchange_rate">[];
  shipmentItems: Pick<ShipmentItem, "quantity_mt">[];
  sellingPricePerMT: number;
  shipment: ShipmentFx;
  costType: CostType;
  rate?: number;
}): LineResult {
  const { item, costType } = args;
  const rate = args.rate ?? rateFor(args.shipment, costType);
  // Apply the chosen rate to charges billed in the deal currency too.
  const fx: ShipmentFx = { ...args.shipment, exchange_rate: rate, actual_exchange_rate: rate };
  const breakdown = computeCostBreakdown(
    args.entries,
    costType,
    rate,
    sortingLossPct(item, costType),
    shipmentChargesPerKg(args.charges, costType, args.shipmentItems, fx)
  );
  const margin = computeMargin(breakdown, args.sellingPricePerMT, item.quantity_mt);
  return { ...margin, rate, totalMarginINR: margin.totalMargin * rate };
}

/**
 * How much of the actual margin (₹) came from the exchange rate moving between quote and payment:
 * actual margin at the realised rate minus the same actual figures at the quoted rate.
 * 0 until a realised rate is recorded.
 */
export function fxEffectINR(args: Omit<Parameters<typeof computeLineResult>[0], "costType" | "rate">): number {
  const { shipment } = args;
  if (!shipment.actual_exchange_rate || shipment.actual_exchange_rate === shipment.exchange_rate) return 0;
  const atRealised = computeLineResult({ ...args, costType: "actual" }).totalMarginINR;
  const atQuoted = computeLineResult({ ...args, costType: "actual", rate: shipment.exchange_rate }).totalMarginINR;
  return atRealised - atQuoted;
}

export function formatMoney(value: number, currency = "USD") {
  if (!isFinite(value)) return "-";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    // Not a valid ISO code (e.g. half-typed) — still show the number.
    return `${currency} ${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }
}

export function formatINR(value: number) {
  if (!isFinite(value)) return "-";
  // Sign before the symbol: \u2212\u20b910,08,000, not \u20b9-10,08,000.
  const sign = value < 0 ? "\u2212" : "";
  return sign + "\u20b9" + Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
