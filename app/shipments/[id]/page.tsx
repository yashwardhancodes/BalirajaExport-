"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  EmptyState,
  ErrorText,
  Field,
  LoadingState,
  marginClass,
  PageHeader,
  Panel,
  Pill,
  Segmented,
  Stat,
  STATUS_STYLE,
  SubSection,
  TypeBadge,
  UnsavedBadge,
} from "@/components/ui";
import {
  createShipmentItem,
  deleteShipmentItem,
  getShipment,
  listClients,
  listCostEntries,
  listProducts,
  listQuotePrices,
  listShipmentCharges,
  listShipmentItems,
  listSupplierRates,
  listSuppliers,
  saveItemFigures,
  saveShipmentCharges,
  updateShipmentFx,
  updateShipmentStatus,
} from "@/lib/actions";
import {
  BASE_CURRENCY,
  BULK_WEIGHT_STAGES,
  COMMON_CURRENCIES,
  Client,
  CostEntry,
  CostStage,
  COST_STAGES,
  CostType,
  DEFAULT_POUCH_KG,
  Product,
  QuotePrice,
  Shipment,
  SHIPMENT_CHARGE_STAGES,
  ShipmentCharge,
  ShipmentItem,
  ShipmentStatus,
  chargesTitle,
  ShipmentType,
  stageGroups,
  stageLabel,
  STAGE_LABELS,
  Supplier,
  SupplierRate,
  isQuoteLocked,
} from "@/lib/types";
import {
  chargeRateToINR,
  ChargesPerKg,
  computeCostBreakdown,
  computeMargin,
  computePackCounts,
  formatMoney,
  formatINR,
  PackSpec,
  perPackedKg,
  rateFor,
  shipmentChargesPerKg,
  sortingLossPct,
  suggestSellingPrice,
} from "@/lib/calc";

// Same stage keys for export and domestic; only the labels differ.
const LINE_STAGES: CostStage[] = stageGroups().flatMap((g) => g.stages);
const MARGIN_PRESETS = [10, 15, 20, 25];

const STATUSES: ShipmentStatus[] = ["quoted", "confirmed", "produced", "shipped", "completed"];

interface ChargeDraft {
  amount: string;
  currency: string;
  rate: string; // only used for currencies other than INR and the shipment's own
}
type ChargeDrafts = Record<CostType, Record<string, ChargeDraft>>;

const EMPTY_CHARGE_DRAFT: ChargeDraft = { amount: "", currency: BASE_CURRENCY, rate: "" };

function draftsFromCharges(charges: ShipmentCharge[]): ChargeDrafts {
  const drafts: ChargeDrafts = { quoted: {}, actual: {} };
  for (const costType of ["quoted", "actual"] as CostType[]) {
    for (const stage of SHIPMENT_CHARGE_STAGES) {
      const c = charges.find((x) => x.stage === stage && x.cost_type === costType);
      drafts[costType][stage] = c
        ? { amount: String(c.amount_total), currency: c.currency, rate: c.exchange_rate != null ? String(c.exchange_rate) : "" }
        : EMPTY_CHARGE_DRAFT;
    }
  }
  return drafts;
}

/** A draft as the charge it would save: only non-INR, non-shipment currencies keep their own rate. */
function chargeFromDraft(d: ChargeDraft, shipmentCurrency: string) {
  const ownRate = d.currency !== BASE_CURRENCY && d.currency !== shipmentCurrency;
  return { amount_total: Number(d.amount) || 0, currency: d.currency, exchange_rate: ownRate ? Number(d.rate) || null : null };
}

function draftsToCharges(drafts: ChargeDrafts, shipmentCurrency: string) {
  return (["quoted", "actual"] as CostType[]).flatMap((cost_type) =>
    SHIPMENT_CHARGE_STAGES.map((stage) => ({ stage, cost_type, ...chargeFromDraft(drafts[cost_type][stage] ?? EMPTY_CHARGE_DRAFT, shipmentCurrency) }))
  );
}

const EMPTY_ITEM_FORM = {
  product_id: "",
  supplier_id: "",
  quantity_mt: "",
  pouch_kg: String(DEFAULT_POUCH_KG),
  pouches_per_carton: "",
  sorting_loss_pct: "",
};

export default function ShipmentDetailPage() {
  const params = useParams();
  const shipmentId = params.id as string;

  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [items, setItems] = useState<ShipmentItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [costEntries, setCostEntries] = useState<CostEntry[]>([]);
  const [quotePrices, setQuotePrices] = useState<QuotePrice[]>([]);
  const [rates, setRates] = useState<SupplierRate[]>([]);
  const [charges, setCharges] = useState<ShipmentCharge[]>([]);
  const [loading, setLoading] = useState(true);

  const [itemForm, setItemForm] = useState(EMPTY_ITEM_FORM);
  const [itemError, setItemError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Port & freight drafts live here so product lines price off what's typed, not just what's saved.
  // Reset from the database only when the saved values actually change — a reload after saving
  // something else must not wipe charges that are typed but not yet saved.
  const savedChargesKey = JSON.stringify(draftsFromCharges(charges));
  const [chargeDrafts, setChargeDrafts] = useState<ChargeDrafts>(() => draftsFromCharges([]));
  useEffect(() => {
    setChargeDrafts(JSON.parse(savedChargesKey));
  }, [savedChargesKey]);
  // Compare what would be saved (numbers), not raw text, so "1000" vs "1000.00" or a leftover rate
  // in a hidden field doesn't count as unsaved.
  const shipmentCurrency = shipment?.currency ?? "";
  const chargesSig = (drafts: ChargeDrafts, costType: CostType) =>
    JSON.stringify(draftsToCharges(drafts, shipmentCurrency).filter((c) => c.cost_type === costType));
  const savedChargeDrafts: ChargeDrafts = JSON.parse(savedChargesKey);
  const chargesDirty: Record<CostType, boolean> = {
    quoted: chargesSig(chargeDrafts, "quoted") !== chargesSig(savedChargeDrafts, "quoted"),
    actual: chargesSig(chargeDrafts, "actual") !== chargesSig(savedChargeDrafts, "actual"),
  };

  // Warn before leaving the page with anything typed but not saved.
  const [dirtyItems, setDirtyItems] = useState<Record<string, boolean>>({});
  const setItemDirty = useCallback((id: string, dirty: boolean) => {
    setDirtyItems((prev) => (prev[id] === dirty ? prev : { ...prev, [id]: dirty }));
  }, []);
  const anyUnsaved = chargesDirty.quoted || chargesDirty.actual || Object.values(dirtyItems).some(Boolean);
  useEffect(() => {
    if (!anyUnsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyUnsaved]);

  // Only the first load blanks the page; later reloads (after a save) refresh in place so
  // other cards keep what's typed in them.
  const load = useCallback(async () => {
    const [sh, i, p, s, r, clients, ch] = await Promise.all([
      getShipment(shipmentId),
      listShipmentItems(shipmentId),
      listProducts(),
      listSuppliers(),
      listSupplierRates(),
      listClients(),
      listShipmentCharges(shipmentId),
    ]);
    setShipment(sh);
    setCharges(ch);
    setClient(clients.find((c) => c.id === sh?.client_id) ?? null);
    setItems(i);
    setProducts(p);
    setSuppliers(s);
    setRates(r);

    const itemIds = i.map((it) => it.id);
    const [ce, qp] = itemIds.length > 0 ? await Promise.all([listCostEntries(itemIds), listQuotePrices(itemIds)]) : [[], []];
    setCostEntries(ce);
    setQuotePrices(qp);
    setLoading(false);
  }, [shipmentId]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateStatus(status: ShipmentStatus) {
    if (!shipment || status === shipment.status) return;
    const wasLocked = isQuoteLocked(shipment.status);
    const willLock = isQuoteLocked(status);
    if (!wasLocked && willLock) {
      const unsavedQuoted = chargesDirty.quoted || Object.values(dirtyItems).some(Boolean);
      const message =
        (unsavedQuoted ? "You have unsaved changes on this shipment. Save them first — once locked, quoted figures can't be saved.\n\n" : "") +
        `Mark as ${status}? This locks the quoted figures as the baseline that actuals are compared against.`;
      if (!confirm(message)) return;
    } else if (wasLocked && !willLock) {
      if (!confirm("Move back to Quoted? This unlocks the quoted figures, so the baseline for margin drift can be changed.")) return;
    }
    await updateShipmentStatus(shipmentId, status);
    load();
  }

  // rates are sorted newest first, so the first match is the supplier's current bulk rate.
  const latestRate = rates.find((r) => r.supplier_id === itemForm.supplier_id && r.product_id === itemForm.product_id);

  function selectProduct(productId: string) {
    const product = products.find((p) => p.id === productId);
    setItemForm({
      ...itemForm,
      product_id: productId,
      pouch_kg: String(product?.standard_pack_kg || DEFAULT_POUCH_KG),
      pouches_per_carton: product?.default_pouches_per_carton ? String(product.default_pouches_per_carton) : "",
      sorting_loss_pct: product?.default_sorting_loss_pct != null ? String(product.default_sorting_loss_pct) : "",
    });
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!itemForm.product_id || !itemForm.quantity_mt) return;
    setItemError(null);
    try {
      // The server also seeds the quoted raw material cost from the supplier's current bulk rate.
      await createShipmentItem({
        shipment_id: shipmentId,
        product_id: itemForm.product_id,
        supplier_id: itemForm.supplier_id || null,
        quantity_mt: Number(itemForm.quantity_mt),
        pouch_kg: Number(itemForm.pouch_kg) || DEFAULT_POUCH_KG,
        pouches_per_carton: Number(itemForm.pouches_per_carton) || null,
        sorting_loss_pct_quoted: Number(itemForm.sorting_loss_pct) || 0,
      });
    } catch (err) {
      setItemError(err instanceof Error ? err.message : String(err));
      return;
    }
    setItemForm(EMPTY_ITEM_FORM);
    setShowAddForm(false);
    load();
  }

  async function removeItem(id: string) {
    if (!confirm("Remove this line item and its cost/quote data?")) return;
    await deleteShipmentItem(id);
    setDirtyItems(({ [id]: _removed, ...rest }) => rest);
    load();
  }

  if (loading) return <LoadingState />;
  if (!shipment) return <EmptyState title="Shipment not found">It may have been deleted. <Link href="/shipments" className="link">Back to shipments</Link></EmptyState>;
  const quoteLocked = isQuoteLocked(shipment.status);
  const totalMT = items.reduce((sum, it) => sum + it.quantity_mt, 0);
  const addOpen = !quoteLocked && (showAddForm || items.length === 0);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Link href="/shipments" className="btn-ghost -ml-2 text-xs">← All shipments</Link>
        <PageHeader
          eyebrow={client?.name ?? "No client"}
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{shipment.code}</span>
              <TypeBadge type={shipment.type} />
            </span>
          }
          description={
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              {shipment.type === "domestic" ? (
                <span>{shipment.delivery_location ? `Deliver to ${shipment.delivery_location}` : "Delivery location not set"}</span>
              ) : (
                <>
                  <span>{shipment.incoterm ?? "Incoterm not set"}</span>
                  {(shipment.port_of_loading || shipment.port_of_discharge) && (
                    <span>{shipment.port_of_loading ?? "?"} → {shipment.port_of_discharge ?? "?"}</span>
                  )}
                </>
              )}
              <span className="figure">{items.length} product{items.length === 1 ? "" : "s"} · {+totalMT.toFixed(3)} MT packed</span>
            </span>
          }
          actions={quoteLocked ? <Pill>Quote locked</Pill> : undefined}
        />
        <StatusStepper status={shipment.status} onChange={updateStatus} />
      </div>

      {shipment.type === "export" ? (
        <ShipmentFxCard shipment={shipment} onSaved={load} />
      ) : (
        <p className="text-sm text-slate-500">Domestic shipment: all prices, costs and margins are in ₹.</p>
      )}

      {quoteLocked ? (
        <p className="text-sm text-slate-500">
          Products can&apos;t be added or removed while the quote is locked ({shipment.status}). Move the status back to Quoted to
          change what&apos;s on this shipment.
        </p>
      ) : addOpen ? (
        <Panel
          title="Add a product"
          description="Pack size and sorting loss fill in from the product. The supplier's latest bulk rate becomes the quoted raw material cost."
          actions={items.length > 0 ? <button type="button" className="btn-ghost" onClick={() => setShowAddForm(false)}>Close</button> : undefined}
        >
          <form onSubmit={addItem} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label="Product" htmlFor="add-product">
              <select id="add-product" className="input" value={itemForm.product_id} onChange={(e) => selectProduct(e.target.value)} required>
                <option value="">Select product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Supplier" htmlFor="add-supplier">
              <select id="add-supplier" className="input" value={itemForm.supplier_id} onChange={(e) => setItemForm({ ...itemForm, supplier_id: e.target.value })}>
                <option value="">Select supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Quantity (MT packed)" htmlFor="add-qty">
              <input id="add-qty" className="input" type="number" step="0.01" min="0" value={itemForm.quantity_mt} onChange={(e) => setItemForm({ ...itemForm, quantity_mt: e.target.value })} required />
            </Field>
            <div className="flex items-end text-xs text-slate-600 pb-2">
              {!itemForm.supplier_id || !itemForm.product_id ? (
                "Pick a product and supplier to pull their bulk rate."
              ) : latestRate ? (
                <span>
                  Bulk rate <span className="figure font-medium text-ink">{formatINR(latestRate.rate_per_kg)}/kg</span> ({latestRate.effective_date})
                </span>
              ) : (
                <span className="text-amber-700">No rate logged for this supplier and product.</span>
              )}
            </div>
            <Field label="Pouch size (kg net)" htmlFor="add-pouch">
              <input id="add-pouch" className="input" type="number" step="0.01" min="0" value={itemForm.pouch_kg} onChange={(e) => setItemForm({ ...itemForm, pouch_kg: e.target.value })} required />
            </Field>
            <Field label="Pouches per carton" htmlFor="add-ppc">
              <input id="add-ppc" className="input" type="number" step="1" min="1" value={itemForm.pouches_per_carton} onChange={(e) => setItemForm({ ...itemForm, pouches_per_carton: e.target.value })} />
            </Field>
            <Field label="Sorting loss (% of bulk)" htmlFor="add-loss">
              <input id="add-loss" className="input" type="number" step="0.01" min="0" max="99.99" value={itemForm.sorting_loss_pct} onChange={(e) => setItemForm({ ...itemForm, sorting_loss_pct: e.target.value })} placeholder="0" />
            </Field>
            <div className="flex items-end">
              <button className="btn w-full sm:w-auto">Add to shipment</button>
            </div>
            {itemError && <div className="sm:col-span-2 lg:col-span-4"><ErrorText>Couldn&apos;t add the product: {itemError}</ErrorText></div>}
          </form>
        </Panel>
      ) : (
        <button type="button" className="btn-secondary" onClick={() => setShowAddForm(true)}>
          + Add another product
        </button>
      )}

      {items.length === 0 ? (
        <EmptyState title="No products on this shipment yet">Add one above to start costing.</EmptyState>
      ) : (
        <div className="space-y-6">
          <ShipmentChargesCard
            shipment={shipment}
            items={items}
            drafts={chargeDrafts}
            dirty={chargesDirty}
            onDraftChange={(costType, stage, patch) =>
              setChargeDrafts((prev) => ({
                ...prev,
                [costType]: { ...prev[costType], [stage]: { ...(prev[costType][stage] ?? EMPTY_CHARGE_DRAFT), ...patch } },
              }))
            }
            onSaved={load}
          />
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              product={products.find((p) => p.id === item.product_id)}
              supplier={suppliers.find((s) => s.id === item.supplier_id)}
              currency={shipment.currency}
              exchangeRates={{ quoted: rateFor(shipment, "quoted"), actual: rateFor(shipment, "actual") }}
              quoteLocked={quoteLocked}
              status={shipment.status}
              costEntries={costEntries.filter((c) => c.shipment_item_id === item.id)}
              quotePrices={quotePrices.filter((q) => q.shipment_item_id === item.id)}
              shipmentType={shipment.type}
              chargesPerKg={{
                quoted: shipmentChargesPerKg(draftsToCharges(chargeDrafts, shipment.currency), "quoted", items, shipment),
                actual: shipmentChargesPerKg(draftsToCharges(chargeDrafts, shipment.currency), "actual", items, shipment),
              }}
              chargesUnsaved={chargesDirty}
              onDirtyChange={setItemDirty}
              onRemove={() => removeItem(item.id)}
              onChanged={load}
            />
          ))}
        </div>
      )}

      {anyUnsaved && <UnsavedBar targetId={chargesDirty.quoted || chargesDirty.actual ? "save-charges" : `save-${Object.keys(dirtyItems).find((id) => dirtyItems[id])}`} />}
    </div>
  );
}

/** Floats above the phone tab bar (and bottom-right on desktop) while anything is unsaved; jumps to the Save button. */
function UnsavedBar({ targetId }: { targetId: string }) {
  function jump() {
    const el = document.getElementById(targetId);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => el?.focus(), 400);
  }
  return (
    <div
      className="fixed inset-x-3 z-30 md:inset-x-auto md:right-6 md:bottom-6 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))]"
      role="status"
    >
      <div className="flex items-center justify-between gap-3 rounded-xl bg-ink text-white px-4 py-3 shadow-lg md:min-w-[22rem]">
        <span className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full bg-bronze-light" aria-hidden />
          Unsaved changes
        </span>
        <button type="button" onClick={jump} className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-medium hover:bg-white/25">
          Go to Save
        </button>
      </div>
    </div>
  );
}

function ItemCard({
  item,
  product,
  supplier,
  currency,
  exchangeRates,
  quoteLocked,
  status,
  costEntries,
  quotePrices,
  shipmentType,
  chargesPerKg,
  chargesUnsaved,
  onDirtyChange,
  onRemove,
  onChanged,
}: {
  item: ShipmentItem;
  product?: Product;
  supplier?: Supplier;
  currency: string;
  exchangeRates: Record<CostType, number>;
  quoteLocked: boolean;
  status: ShipmentStatus;
  costEntries: CostEntry[];
  quotePrices: QuotePrice[];
  shipmentType: ShipmentType;
  chargesPerKg: Record<CostType, ChargesPerKg>;
  chargesUnsaved: Record<CostType, boolean>;
  onDirtyChange: (itemId: string, dirty: boolean) => void;
  onRemove: () => void;
  onChanged: () => void;
}) {
  const [costType, setCostType] = useState<CostType>(quoteLocked ? "actual" : "quoted");
  const exchangeRate = exchangeRates[costType];
  const readOnly = quoteLocked && costType === "quoted";
  const [stageValues, setStageValues] = useState<Record<string, string>>({});
  const [priceValue, setPriceValue] = useState<string>("");
  const [targetMargin, setTargetMargin] = useState<string>("");
  const [packForm, setPackForm] = useState({ pouch_kg: "", pouches_per_carton: "" });
  const [lossValue, setLossValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What's typed right now, so the hints and pack counts update before saving.
  const draftSpec: PackSpec = {
    pouch_kg: Number(packForm.pouch_kg) || 0,
    pouches_per_carton: Number(packForm.pouches_per_carton) || null,
  };
  // Blank actual loss falls back to the quoted loss (same rule as sortingLossPct); blank quoted loss is 0%.
  const draftLossPct =
    lossValue !== "" ? Number(lossValue) || 0 : costType === "actual" ? sortingLossPct(item, "quoted") : 0;

  // What's saved for this side, as form strings. Keyed by content (not array identity), so the form only
  // resets when saved values really change — not on every parent re-render or after another card saves.
  const savedPrice = quotePrices.find((q) => q.cost_type === costType);
  const savedLoss = costType === "quoted" ? item.sorting_loss_pct_quoted : item.sorting_loss_pct_actual;
  const savedKey = JSON.stringify({
    values: Object.fromEntries(
      LINE_STAGES.map((stage) => {
        const entry = costEntries.find((c) => c.stage === stage && c.cost_type === costType);
        return [stage, entry ? String(entry.amount_per_kg) : ""];
      })
    ),
    price: savedPrice ? String(savedPrice.selling_price_per_mt) : "",
    loss: savedLoss != null ? String(savedLoss) : "",
    pack: {
      pouch_kg: String(item.pouch_kg ?? DEFAULT_POUCH_KG),
      pouches_per_carton: item.pouches_per_carton ? String(item.pouches_per_carton) : "",
    },
  });

  useEffect(() => {
    const saved = JSON.parse(savedKey);
    setStageValues(saved.values);
    setPriceValue(saved.price);
    setLossValue(saved.loss);
    setPackForm(saved.pack);
  }, [savedKey]);

  // Compare as numbers, so "42" vs "42.0" isn't "unsaved"; a blank loss stays distinct (actual falls back to quoted).
  const formSig = (f: { values: Record<string, string>; price: string; loss: string; pack: { pouch_kg: string; pouches_per_carton: string } }) =>
    JSON.stringify({
      values: LINE_STAGES.map((s) => Number(f.values[s]) || 0),
      price: Number(f.price) || 0,
      loss: f.loss === "" ? null : Number(f.loss) || 0,
      pack: [Number(f.pack.pouch_kg) || 0, Number(f.pack.pouches_per_carton) || 0],
    });
  const dirty = formSig({ values: stageValues, price: priceValue, loss: lossValue, pack: packForm }) !== formSig(JSON.parse(savedKey));
  useEffect(() => {
    onDirtyChange(item.id, dirty);
  }, [item.id, dirty, onDirtyChange]);

  function switchCostType(next: CostType) {
    if (next === costType) return;
    if (dirty && !confirm(`You have unsaved ${costType} figures on this line. Switch to ${next} and discard them?`)) return;
    setCostType(next);
  }

  function saveStage(stage: CostStage, value: string) {
    setStageValues((v) => ({ ...v, [stage]: value }));
  }

  async function saveAll(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const lossUpdate =
      costType === "quoted"
        ? { sorting_loss_pct_quoted: Number(lossValue) || 0 }
        : { sorting_loss_pct_actual: lossValue === "" ? null : Number(lossValue) || 0 };

    try {
      await saveItemFigures({
        itemId: item.id,
        costType,
        item: {
          pouch_kg: draftSpec.pouch_kg || DEFAULT_POUCH_KG,
          pouches_per_carton: draftSpec.pouches_per_carton,
          ...lossUpdate,
        },
        costs: LINE_STAGES.map((stage) => ({
          stage,
          amount_per_kg: stageValues[stage] ? Number(stageValues[stage]) : 0,
        })),
        sellingPricePerMT: priceValue ? Number(priceValue) : 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setSaving(false);
    onChanged();
  }

  const packCounts = computePackCounts(item.quantity_mt, draftSpec, draftLossPct);
  const savedLossPct = sortingLossPct(item, costType);

  // Cost to us, from what's typed right now — so the price can be worked out before saving.
  const draftEntries = LINE_STAGES.map((stage) => ({ stage, cost_type: costType, amount_per_kg: Number(stageValues[stage]) || 0 }));
  const sharedPerKg = chargesPerKg[costType];
  const breakdown = computeCostBreakdown(draftEntries, costType, exchangeRate, draftLossPct, sharedPerKg);
  const lossCostPerKg = breakdown.totalPerKgINR - computeCostBreakdown(draftEntries, costType, exchangeRate, 0, sharedPerKg).totalPerKgINR;
  const sharedTotalPerKg = SHIPMENT_CHARGE_STAGES.reduce((sum, s) => sum + (sharedPerKg[s] ?? 0), 0);
  const suggestedPrice = targetMargin !== "" ? suggestSellingPrice(breakdown.totalPerMTFx, Number(targetMargin)) : 0;
  const margin = computeMargin(breakdown, Number(priceValue) || 0, item.quantity_mt);

  return (
    <section className="card p-0 overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-5 border-b border-line">
        <div className="min-w-0 space-y-1">
          <h2 className="text-base font-semibold flex flex-wrap items-center gap-2">
            {product?.name ?? "Unknown product"}
            {dirty && <UnsavedBadge />}
          </h2>
          <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>{supplier?.name ?? "No supplier set"}</span>
            <span className="figure">{item.quantity_mt} MT packed</span>
            <span className="figure">
              {item.pouch_kg} kg pouches{item.pouches_per_carton ? ` × ${item.pouches_per_carton} per carton` : ""}
            </span>
            <span className="figure">{savedLossPct}% sorting loss ({costType})</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            label="Figures to show"
            value={costType}
            onChange={switchCostType}
            options={[
              { value: "quoted", label: quoteLocked ? "Quoted (locked)" : "Quoted" },
              { value: "actual", label: "Actual" },
            ]}
          />
          {!quoteLocked && (
            <button onClick={onRemove} className="btn-danger-ghost">Remove</button>
          )}
        </div>
      </header>

      {readOnly && (
        <div className="px-4 pt-4 sm:px-5">
          <LockedNote status={status} />
        </div>
      )}

      <form onSubmit={saveAll}>
        <fieldset disabled={readOnly} className="min-w-0 grid lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Inputs */}
          <div className="p-4 sm:p-5 space-y-6 min-w-0">
            <SubSection
              title="Export packing"
              hint={
                <span className="figure">
                  {packCounts.kgPerCarton ? `${packCounts.kgPerCarton} kg/carton · ` : ""}
                  {packCounts.pouches.toLocaleString("en-IN")} pouches
                  {packCounts.cartons !== null ? ` · ${packCounts.cartons.toLocaleString("en-IN")} cartons` : ""}
                </span>
              }
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label="Pouch size (kg net)" htmlFor={`${item.id}-pouch`}>
                  <input id={`${item.id}-pouch`} className="input" type="number" step="0.01" min="0" value={packForm.pouch_kg} onChange={(e) => setPackForm({ ...packForm, pouch_kg: e.target.value })} required />
                </Field>
                <Field label="Pouches per carton" htmlFor={`${item.id}-ppc`}>
                  <input id={`${item.id}-ppc`} className="input" type="number" step="1" min="1" value={packForm.pouches_per_carton} onChange={(e) => setPackForm({ ...packForm, pouches_per_carton: e.target.value })} />
                </Field>
              </div>
              <p className="text-[11px] text-slate-500">Same for quoted and actual.</p>
            </SubSection>

            {stageGroups(shipmentType).map((group, groupIdx) => (
              <SubSection key={group.title} title={group.title}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {groupIdx === 0 && (
                    <Field
                      label="Sorting loss (% of bulk)"
                      htmlFor={`${item.id}-loss`}
                      hint={<span className="figure">Buy {Math.round(packCounts.bulkKgNeeded).toLocaleString("en-IN")} kg bulk</span>}
                    >
                      <input
                        id={`${item.id}-loss`}
                        className="input"
                        type="number"
                        step="0.01"
                        min="0"
                        max="99.99"
                        value={lossValue}
                        placeholder={costType === "actual" ? `Quoted: ${item.sorting_loss_pct_quoted ?? 0}%` : "0"}
                        onChange={(e) => setLossValue(e.target.value)}
                      />
                    </Field>
                  )}
                  {group.stages.map((stage) => {
                    const raw = stageValues[stage];
                    const grossedUp = BULK_WEIGHT_STAGES.has(stage) && draftLossPct > 0 && raw;
                    return (
                      <Field
                        key={stage}
                        label={stageLabel(stage, shipmentType)}
                        htmlFor={`${item.id}-${stage}`}
                        hint={grossedUp ? <span className="figure">= {formatINR(perPackedKg(stage, Number(raw), draftLossPct))} per packed kg</span> : undefined}
                      >
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₹</span>
                          <input
                            id={`${item.id}-${stage}`}
                            className="input pl-7 pr-10"
                            type="number"
                            step="0.01"
                            min="0"
                            value={raw ?? ""}
                            onChange={(e) => saveStage(stage, e.target.value)}
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">/kg</span>
                        </div>
                      </Field>
                    );
                  })}
                </div>
              </SubSection>
            ))}

            <SubSection title={`${chargesTitle(shipmentType)} · share of shipment totals`}>
              {sharedTotalPerKg > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {SHIPMENT_CHARGE_STAGES.filter((s) => (sharedPerKg[s] ?? 0) > 0).map((s) => (
                    <span key={s} className="inline-flex items-baseline gap-1.5 rounded-md bg-canvas px-2.5 py-1 text-xs">
                      <span className="text-slate-500">{stageLabel(s, shipmentType)}</span>
                      <span className="figure font-medium">{formatINR(sharedPerKg[s] ?? 0)}/kg</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-amber-700">No {costType} {chargesTitle(shipmentType).toLowerCase()} yet. Enter the totals in the shipment card above.</p>
              )}
              {chargesUnsaved[costType] && (
                <p className="text-xs text-amber-700">Includes {chargesTitle(shipmentType).toLowerCase()} typed above but not saved yet.</p>
              )}
            </SubSection>
          </div>

          {/* Summary: cost first, then price */}
          <aside className="border-t lg:border-t-0 lg:border-l border-line bg-canvas/60 p-4 sm:p-5 min-w-0">
            <div className="lg:sticky lg:top-4 space-y-5">
              <SubSection title={`Cost to us · ${costType}`}>
                <div className="rounded-lg bg-white border border-line p-4 space-y-3">
                  <Stat size="lg" label="Per packed kg" value={formatINR(breakdown.totalPerKgINR)} />
                  <div className="grid grid-cols-2 gap-3">
                    <Stat label="Per MT" value={formatINR(breakdown.totalPerMTINR)} />
                    {shipmentType === "export" && <Stat label={`Per MT (${currency})`} value={formatMoney(breakdown.totalPerMTFx, currency)} />}
                  </div>
                  <Stat
                    label={`Whole line, ${item.quantity_mt} MT`}
                    value={formatMoney(breakdown.totalPerMTFx * item.quantity_mt, currency)}
                    sub={formatINR(breakdown.totalPerMTINR * item.quantity_mt)}
                  />
                  <div className="text-[11px] text-slate-500 border-t border-line pt-2 space-y-0.5 figure">
                    <div>Sorting loss ({draftLossPct}%) adds {formatINR(lossCostPerKg)}/kg</div>
                    <div>{chargesTitle(shipmentType)} {formatINR(sharedTotalPerKg)}/kg</div>
                    {shipmentType === "export" && <div>At ₹{exchangeRate} per {currency}</div>}
                  </div>
                </div>
              </SubSection>

              <SubSection title="Client price">
                <div className="rounded-lg bg-white border border-line p-4 space-y-4">
                  <Field label="Target margin" htmlFor={`${item.id}-target`}>
                    <div className="flex gap-2">
                      <div className="relative w-[4.5rem] shrink-0">
                        <input
                          id={`${item.id}-target`}
                          className="input pl-2.5 pr-6"
                          type="number"
                          step="0.5"
                          min="0"
                          max="99"
                          value={targetMargin}
                          onChange={(e) => setTargetMargin(e.target.value)}
                          placeholder="15"
                        />
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {MARGIN_PRESETS.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setTargetMargin(String(m))}
                            className={`rounded-md px-1.5 py-1 text-xs font-medium transition-colors ${
                              targetMargin === String(m) ? "bg-brand text-white" : "bg-canvas text-slate-600 hover:text-ink"
                            }`}
                          >
                            {m}%
                          </button>
                        ))}
                      </div>
                    </div>
                  </Field>
                  {breakdown.totalPerMTFx <= 0 ? (
                    <p className="text-xs text-slate-500">Enter costs first; the suggested price is worked out from them.</p>
                  ) : suggestedPrice > 0 ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-brand-soft px-3 py-2">
                      <div>
                        <div className="text-[11px] text-brand-dark">Suggested at {targetMargin}%</div>
                        <div className="figure font-semibold text-brand-dark">{formatMoney(suggestedPrice, currency)}/MT</div>
                      </div>
                      <button type="button" onClick={() => setPriceValue(suggestedPrice.toFixed(2))} className="btn py-1.5 text-xs">
                        Use price
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">Pick a target margin to get a suggested price.</p>
                  )}
                  <Field label={`Selling price (${currency}/MT)`} htmlFor={`${item.id}-price`}>
                    <input id={`${item.id}-price`} className="input text-base font-semibold figure" type="number" step="0.01" min="0" value={priceValue} onChange={(e) => setPriceValue(e.target.value)} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
                    <Stat label="Margin / MT" value={formatMoney(margin.marginPerMT, currency)} accent={marginClass(Number(priceValue) ? margin.marginPerMT : null)} />
                    <Stat label="Margin %" value={`${margin.marginPct.toFixed(1)}%`} accent={marginClass(Number(priceValue) ? margin.marginPct : null)} />
                    <div className="col-span-2">
                      <Stat
                        size="lg"
                        label={`Total margin, ${item.quantity_mt} MT`}
                        value={formatMoney(margin.totalMargin, currency)}
                        accent={marginClass(Number(priceValue) ? margin.totalMargin : null)}
                        sub={Number(priceValue) ? formatINR(margin.totalMargin * exchangeRate) : "Enter a selling price"}
                      />
                    </div>
                  </div>
                </div>
              </SubSection>

              <div className="space-y-2">
                {error && <ErrorText>Couldn&apos;t save: {error}</ErrorText>}
                <button id={`save-${item.id}`} className="btn w-full" disabled={saving || !dirty}>{saving ? "Saving…" : `Save ${costType} figures`}</button>
                <p className={`text-[11px] text-center ${dirty ? "text-amber-700" : "text-slate-500"}`}>
                  {dirty ? "Not saved yet. The figures above are only stored when you save." : `All ${costType} figures saved.`}
                </p>
              </div>
            </div>
          </aside>
        </fieldset>
      </form>

      <div className="border-t border-line px-4 py-4 sm:px-5">
        <SubSection title={`Where the cost goes · ₹ per packed kg, ${costType}`}>
          <div className="space-y-1.5">
            {COST_STAGES.filter((s) => (breakdown.perKgByStage[s] ?? 0) > 0).map((stage) => {
              const value = breakdown.perKgByStage[stage] ?? 0;
              const pct = breakdown.totalPerKgINR ? (value / breakdown.totalPerKgINR) * 100 : 0;
              return (
                <div key={stage} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4.5rem_2.5rem] sm:grid-cols-[12rem_minmax(0,1fr)_5rem_3rem] items-center gap-3 text-xs">
                  <div className="truncate text-slate-600">{stageLabel(stage, shipmentType)}</div>
                  <div className="h-2 rounded-full bg-canvas overflow-hidden">
                    <div className="h-2 rounded-full bg-brand" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="figure text-right font-medium">{formatINR(value)}</div>
                  <div className="figure text-right text-slate-500">{pct.toFixed(0)}%</div>
                </div>
              );
            })}
            {breakdown.totalPerKgINR === 0 && <div className="text-xs text-slate-400">No costs entered yet.</div>}
          </div>
        </SubSection>
      </div>
    </section>
  );
}

/** The shipment's deal currency and exchange rate — every ₹ ↔ price conversion on this shipment uses it. */
function ShipmentFxCard({ shipment, onSaved }: { shipment: Shipment; onSaved: () => void }) {
  const locked = isQuoteLocked(shipment.status);
  const [currency, setCurrency] = useState(shipment.currency);
  const [rate, setRate] = useState(String(shipment.exchange_rate));
  const [actualRate, setActualRate] = useState(shipment.actual_exchange_rate != null ? String(shipment.actual_exchange_rate) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrency(shipment.currency);
    setRate(String(shipment.exchange_rate));
    setActualRate(shipment.actual_exchange_rate != null ? String(shipment.actual_exchange_rate) : "");
  }, [shipment.currency, shipment.exchange_rate, shipment.actual_exchange_rate]);

  const code = currency.trim().toUpperCase();
  const actualRateValue = actualRate === "" ? null : Number(actualRate);
  const changed =
    code !== shipment.currency || Number(rate) !== shipment.exchange_rate || actualRateValue !== shipment.actual_exchange_rate;
  const rateMove =
    shipment.actual_exchange_rate != null ? ((shipment.actual_exchange_rate - shipment.exchange_rate) / shipment.exchange_rate) * 100 : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateShipmentFx(shipment.id, { currency: code, exchange_rate: Number(rate), actual_exchange_rate: actualRateValue });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setSaving(false);
    onSaved();
  }

  return (
    <form onSubmit={save} className="card space-y-4">
      <div className="space-y-0.5">
        <h2 className="text-base font-semibold flex flex-wrap items-center gap-2">
          Currency &amp; exchange rates
          {changed && <UnsavedBadge />}
        </h2>
        <p className="text-xs text-slate-500">₹ per 1 unit of the client&apos;s currency. Quoted figures use the quoted rate; actual figures use the realised rate once you enter it.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        <div>
          <label className="label" htmlFor="fx-currency">Client price currency</label>
          <input
            id="fx-currency"
            className="input uppercase font-mono"
            list="currency-options"
            maxLength={3}
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            disabled={locked}
            required
          />
          <datalist id="currency-options">
            {COMMON_CURRENCIES.filter((c) => c !== BASE_CURRENCY).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label" htmlFor="fx-quoted">Quoted rate (₹ per 1 {code || "unit"})</label>
          <input
            id="fx-quoted"
            className="input figure"
            type="number"
            step="0.0001"
            min="0.0001"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            disabled={locked}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="fx-actual">Realised rate when paid (₹ per 1 {code || "unit"})</label>
          <input
            id="fx-actual"
            className="input figure"
            type="number"
            step="0.0001"
            min="0.0001"
            value={actualRate}
            onChange={(e) => setActualRate(e.target.value)}
            placeholder="Not paid yet"
          />
        </div>
        <div className="flex items-center gap-3">
          <button className="btn" disabled={saving || !changed}>{saving ? "Saving…" : "Save rates"}</button>
        </div>
      </div>
      <div className="text-xs text-slate-500 figure">
        Quoted figures use ₹{shipment.exchange_rate}; actual figures use{" "}
        {shipment.actual_exchange_rate != null ? `the realised ₹${shipment.actual_exchange_rate}` : `₹${shipment.exchange_rate} until the realised rate is entered`}.
        {rateMove !== null && rateMove !== 0 && (
          <span className={rateMove > 0 ? "text-emerald-700" : "text-red-600"}>
            {" "}The {shipment.currency} {rateMove > 0 ? "rose" : "fell"} {Math.abs(rateMove).toFixed(2)}% between quote and payment.
          </span>
        )}
      </div>
      {locked && (
        <p className="text-xs text-slate-500">Currency and quoted rate are locked with the quote. The realised rate can be set any time.</p>
      )}
      {code !== shipment.currency && (
        <p className="text-xs text-amber-700">
          Changing currency doesn&apos;t convert selling prices already entered in {shipment.currency} — re-check them after saving.
        </p>
      )}
      {error && <ErrorText>Couldn&apos;t save: {error}</ErrorText>}
    </form>
  );
}

/**
 * Port & freight paid once per shipment: enter totals in any currency, the app converts to ₹ and spreads them
 * over all lines by packed kg. Drafts are owned by the page so the product lines price off them as you type.
 */
function ShipmentChargesCard({
  shipment,
  items,
  drafts: allDrafts,
  dirty: allDirty,
  onDraftChange,
  onSaved,
}: {
  shipment: Shipment;
  items: ShipmentItem[];
  drafts: ChargeDrafts;
  dirty: Record<CostType, boolean>;
  onDraftChange: (costType: CostType, stage: CostStage, patch: Partial<ChargeDraft>) => void;
  onSaved: () => void;
}) {
  const quoteLocked = isQuoteLocked(shipment.status);
  const [costType, setCostType] = useState<CostType>(quoteLocked ? "actual" : "quoted");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drafts = allDrafts[costType];
  const dirty = allDirty[costType];
  const readOnly = quoteLocked && costType === "quoted";

  const currencyOptions = Array.from(new Set([BASE_CURRENCY, shipment.currency, ...COMMON_CURRENCIES]));
  const needsOwnRate = (cur: string) => cur !== BASE_CURRENCY && cur !== shipment.currency;
  const inINR = (d: ChargeDraft | undefined) => {
    if (!d) return 0;
    const c = chargeFromDraft(d, shipment.currency);
    return c.amount_total * chargeRateToINR(c, shipment, costType);
  };

  const packedKg = items.reduce((sum, it) => sum + it.quantity_mt * 1000, 0);
  const draftTotal = SHIPMENT_CHARGE_STAGES.reduce((sum, s) => sum + inINR(drafts[s]), 0);
  const missingRate = SHIPMENT_CHARGE_STAGES.find((s) => {
    const d = drafts[s];
    return d && Number(d.amount) > 0 && needsOwnRate(d.currency) && !(Number(d.rate) > 0);
  });

  function update(stage: CostStage, patch: Partial<ChargeDraft>) {
    onDraftChange(costType, stage, patch);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveShipmentCharges(
        shipment.id,
        costType,
        SHIPMENT_CHARGE_STAGES.map((stage) => ({ stage, ...chargeFromDraft(drafts[stage] ?? EMPTY_CHARGE_DRAFT, shipment.currency) }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setSaving(false);
    onSaved();
  }

  return (
    <form onSubmit={save} className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <h2 className="text-base font-semibold flex flex-wrap items-center gap-2">
            {chargesTitle(shipment.type)} · whole shipment
            {(allDirty.quoted || allDirty.actual) && <UnsavedBadge />}
          </h2>
          <div className="text-xs text-slate-500 max-w-2xl">
            {shipment.type === "domestic"
              ? "Enter the full amount paid in ₹. It's divided over "
              : "Enter the full amount paid, in the currency you were billed. It's converted to ₹ and divided over "}
            {packedKg.toLocaleString("en-IN")} kg packed across {items.length} line{items.length === 1 ? "" : "s"}.
          </div>
        </div>
        <Segmented
          label="Charges to show"
          value={costType}
          onChange={setCostType}
          options={[
            { value: "quoted", label: quoteLocked ? "Quoted (locked)" : "Quoted" },
            { value: "actual", label: "Actual" },
          ]}
        />
      </div>
      <fieldset disabled={readOnly} className="grid md:grid-cols-3 gap-4 min-w-0">
        {SHIPMENT_CHARGE_STAGES.map((stage) => {
          const d = drafts[stage] ?? EMPTY_CHARGE_DRAFT;
          const inr = inINR(d);
          const ownRate = needsOwnRate(d.currency);
          return (
            <div key={stage} className="space-y-1">
              <label className="label" htmlFor={`charge-${stage}-amount`}>{stageLabel(stage, shipment.type)} · total bill</label>
              <div className="flex gap-2">
                {shipment.type === "export" && (
                <select
                  className="input w-24 shrink-0 px-2 font-mono"
                  value={d.currency}
                  onChange={(e) => update(stage, { currency: e.target.value })}
                  aria-label={`${stageLabel(stage, shipment.type)} currency`}
                >
                  {currencyOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                )}
                <input
                  id={`charge-${stage}-amount`}
                  className="input min-w-0 flex-1 figure"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Amount"
                  value={d.amount}
                  onChange={(e) => update(stage, { amount: e.target.value })}
                  aria-label={`${stageLabel(stage, shipment.type)} amount`}
                />
              </div>
              {ownRate && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 shrink-0">₹ per 1 {d.currency}</span>
                  <input
                    className="input min-w-0 flex-1"
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={d.rate}
                    onChange={(e) => update(stage, { rate: e.target.value })}
                    required={Number(d.amount) > 0}
                  />
                </div>
              )}
              {Number(d.amount) > 0 && (
                <div className="text-[11px] text-slate-500">
                  {d.currency !== BASE_CURRENCY &&
                    (ownRate
                      ? Number(d.rate) > 0 && `= ${formatINR(inr)} · `
                      : `at ${costType} rate ₹${rateFor(shipment, costType)} = ${formatINR(inr)} · `)}
                  {packedKg > 0 && inr > 0 && `${formatINR(inr / packedKg)}/kg`}
                </div>
              )}
            </div>
          );
        })}
      </fieldset>
      {readOnly && <LockedNote status={shipment.status} />}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 border-t border-line">
        <button id="save-charges" className="btn" disabled={readOnly || saving || !dirty || Boolean(missingRate)}>
          {saving ? "Saving…" : `Save ${costType} ${chargesTitle(shipment.type).toLowerCase()}`}
        </button>
        <div className="text-sm">
          <span className="text-slate-500">Total {costType}</span> <span className="figure font-semibold">{formatINR(draftTotal)}</span>
          {packedKg > 0 && <span className="text-slate-500"> = {formatINR(draftTotal / packedKg)}/kg</span>}
        </div>
        {missingRate ? (
          <span className="text-xs text-amber-700">Enter the exchange rate for {stageLabel(missingRate, shipment.type)}.</span>
        ) : dirty ? (
          <span className="text-xs text-amber-700">Unsaved. Already included in the product prices below, but not stored until you save.</span>
        ) : (
          <span className="text-xs text-slate-500">All {costType} {chargesTitle(shipment.type).toLowerCase()} saved.</span>
        )}
        {allDirty[costType === "quoted" ? "actual" : "quoted"] && (
          <span className="text-xs text-amber-700">
            {costType === "quoted" ? "Actual" : "Quoted"} side also has unsaved changes.
          </span>
        )}
      </div>
      {error && <ErrorText>Couldn&apos;t save: {error}</ErrorText>}
    </form>
  );
}

function LockedNote({ status }: { status: ShipmentStatus }) {
  return (
    <p className="text-xs text-slate-600 bg-canvas border border-line rounded-lg px-3 py-2">
      <strong>Quoted figures are locked</strong> because this shipment is {status}. They&apos;re the baseline that actuals are
      compared against. Move the status back to Quoted to change them.
    </p>
  );
}


/** The status sequence as steps; the current one is filled, earlier ones ticked. Click any step to move there. */
function StatusStepper({ status, onChange }: { status: ShipmentStatus; onChange: (s: ShipmentStatus) => void }) {
  const current = STATUSES.indexOf(status);
  return (
    <ol className="flex items-center overflow-x-auto -mx-4 px-4 pb-1 sm:mx-0 sm:px-0 sm:flex-wrap sm:gap-y-2 sm:overflow-visible" aria-label="Shipment status">
      {STATUSES.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => onChange(s)}
              aria-current={active ? "step" : undefined}
              className={`group inline-flex items-center gap-2 rounded-full pl-1 pr-3 py-1 text-xs font-medium capitalize transition-colors ${
                active ? `${STATUS_STYLE[s]} ring-1 ring-inset` : "text-slate-500 hover:bg-white hover:text-ink"
              }`}
            >
              <span
                className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-semibold ${
                  active ? "bg-white/70" : done ? "bg-brand text-white" : "bg-white ring-1 ring-line"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              {s}
            </button>
            {i < STATUSES.length - 1 && <span className={`mx-0.5 h-px w-3 sm:mx-1 sm:w-8 ${i < current ? "bg-brand" : "bg-line"}`} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
