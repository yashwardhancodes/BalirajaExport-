"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listClients,
  listCostEntries,
  listProducts,
  listQuotePrices,
  listShipmentCharges,
  listShipmentItems,
  listShipments,
} from "@/lib/actions";
import { CostType, Shipment } from "@/lib/types";
import { computeLineResult, formatINR, formatMoney, fxEffectINR, LineResult } from "@/lib/calc";
import { EmptyState, LoadingState, marginClass, PageHeader, Panel, Pill, Stat, StatusBadge } from "@/components/ui";

interface Row {
  itemId: string;
  shipment: Shipment;
  clientName: string;
  productName: string;
  quantity: number;
  quoted: LineResult;
  quotedPriced: boolean; // a line with no selling price has no margin yet, only a cost
  actual: LineResult | null; // null until any actual figure is entered
  actualPriced: boolean;
  fxEffect: number | null; // ₹ of the actual margin due to the realised rate; null until that rate is recorded
}

interface NextStep {
  key: string;
  text: string;
  href: string;
  action: string;
}

/** What needs doing next, worked out from the data, so the dashboard reads as a to-do list as well as a report. */
function buildNextSteps(
  rows: Row[],
  products: { id: string; name: string; default_pouches_per_carton: number | null; default_sorting_loss_pct: number | null }[],
  shipmentCount: number
): NextStep[] {
  const steps: NextStep[] = [];
  if (products.length === 0) steps.push({ key: "products", text: "Add your first product", href: "/products", action: "Add product" });
  if (shipmentCount === 0 && products.length > 0) {
    steps.push({ key: "first-shipment", text: "Create your first shipment to start costing", href: "/shipments", action: "New shipment" });
  }
  const seen = new Set<string>();
  for (const r of rows) {
    const id = r.shipment.id;
    if (!r.quotedPriced && !seen.has(`price-${id}`)) {
      seen.add(`price-${id}`);
      steps.push({ key: `price-${id}`, text: `${r.shipment.code}: set a selling price for ${r.productName}`, href: `/shipments/${id}`, action: "Set price" });
    }
    const afterShipping = r.shipment.status === "shipped" || r.shipment.status === "completed";
    if (afterShipping && !r.actual && !seen.has(`actual-${id}`)) {
      seen.add(`actual-${id}`);
      steps.push({ key: `actual-${id}`, text: `${r.shipment.code} has shipped: enter the actual costs`, href: `/shipments/${id}`, action: "Enter actuals" });
    }
    if (afterShipping && !r.shipment.actual_exchange_rate && !seen.has(`fx-${id}`)) {
      seen.add(`fx-${id}`);
      steps.push({ key: `fx-${id}`, text: `${r.shipment.code}: record the exchange rate you were paid at`, href: `/shipments/${id}`, action: "Add rate" });
    }
  }
  const missingDefaults = products.filter((p) => !p.default_pouches_per_carton || p.default_sorting_loss_pct == null);
  if (missingDefaults.length > 0) {
    steps.push({
      key: "defaults",
      text: `${missingDefaults.map((p) => p.name).join(", ")}: set pouches per carton and typical sorting loss`,
      href: "/products",
      action: "Edit product",
    });
  }
  return steps;
}

export default function DashboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [nextSteps, setNextSteps] = useState<NextStep[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [shipments, clients, items, products, costEntries, quotePrices, charges] = await Promise.all([
        listShipments(),
        listClients(),
        listShipmentItems(),
        listProducts(),
        listCostEntries(),
        listQuotePrices(),
        listShipmentCharges(),
      ]);

      const builtRows: Row[] = [];
      for (const item of items) {
        const shipment = shipments.find((s) => s.id === item.shipment_id);
        if (!shipment) continue;
        const itemCosts = costEntries.filter((c) => c.shipment_item_id === item.id);
        const itemQuotes = quotePrices.filter((q) => q.shipment_item_id === item.id);
        const shipmentCharges = charges.filter((c) => c.shipment_id === shipment.id);
        const base = {
          item,
          entries: itemCosts,
          charges: shipmentCharges,
          shipmentItems: items.filter((it) => it.shipment_id === shipment.id),
          shipment,
        };
        const priceFor = (costType: CostType) => itemQuotes.find((q) => q.cost_type === costType)?.selling_price_per_mt ?? 0;

        const hasActual =
          itemCosts.some((c) => c.cost_type === "actual") ||
          itemQuotes.some((q) => q.cost_type === "actual") ||
          shipmentCharges.some((c) => c.cost_type === "actual");
        const actualInput = { ...base, sellingPricePerMT: priceFor("actual") };

        builtRows.push({
          itemId: item.id,
          shipment,
          clientName: clients.find((c) => c.id === shipment.client_id)?.name ?? "No client",
          productName: products.find((p) => p.id === item.product_id)?.name ?? "Unknown",
          quantity: item.quantity_mt,
          quoted: computeLineResult({ ...base, sellingPricePerMT: priceFor("quoted"), costType: "quoted" }),
          quotedPriced: priceFor("quoted") > 0,
          actualPriced: priceFor("actual") > 0,
          actual: hasActual ? computeLineResult({ ...actualInput, costType: "actual" }) : null,
          fxEffect: hasActual && shipment.actual_exchange_rate ? fxEffectINR(actualInput) : null,
        });
      }
      setRows(builtRows);
      setNextSteps(buildNextSteps(builtRows, products, shipments.length));
      setLoading(false);
    })();
  }, []);

  // All totals in ₹: each line is converted at its own shipment's rate before adding up,
  // so shipments quoted in different currencies can be summed.
  const shipmentCount = new Set(rows.map((r) => r.shipment.id)).size;
  // Only lines with a selling price have a margin; unpriced lines would otherwise count as a loss of their full cost.
  const pricedRows = rows.filter((r) => r.quotedPriced);
  const unpricedCount = rows.length - pricedRows.length;
  const totalQuotedINR = pricedRows.reduce((sum, r) => sum + r.quoted.totalMarginINR, 0);
  const rowsWithActual = rows.filter((r) => r.actual !== null && r.actualPriced);
  const totalActualINR = rowsWithActual.reduce((sum, r) => sum + (r.actual?.totalMarginINR ?? 0), 0);
  const driftRows = rowsWithActual.filter((r) => r.quotedPriced);
  const driftINR =
    driftRows.length > 0
      ? driftRows.reduce((sum, r) => sum + (r.actual?.totalMarginINR ?? 0) - r.quoted.totalMarginINR, 0)
      : null;
  const fxINR = driftRows.reduce((sum, r) => sum + (r.fxEffect ?? 0), 0);
  const hasFx = driftRows.some((r) => r.fxEffect !== null);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Quoted margin against actual margin for every shipment line. Totals are in ₹, each line converted at its own shipment's rate."
        actions={
          <Link href="/shipments" className="btn">
            New shipment
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card">
          <Stat size="lg" label="Shipments" value={String(shipmentCount)} sub={`${rows.length} product line${rows.length === 1 ? "" : "s"}`} />
        </div>
        <div className="card">
          <Stat
            size="lg"
            label="Total quoted margin"
            value={pricedRows.length ? formatINR(totalQuotedINR) : "No prices yet"}
            accent={pricedRows.length ? marginClass(totalQuotedINR) : "text-slate-400"}
            sub={unpricedCount > 0 ? `${unpricedCount} line${unpricedCount === 1 ? "" : "s"} without a selling price not counted` : undefined}
          />
        </div>
        <div className="card">
          <Stat
            size="lg"
            label="Total actual margin"
            value={rowsWithActual.length > 0 ? formatINR(totalActualINR) : "Not shipped yet"}
            accent={rowsWithActual.length > 0 ? marginClass(totalActualINR) : "text-slate-400"}
            sub={rowsWithActual.length > 0 ? `${rowsWithActual.length} line${rowsWithActual.length === 1 ? "" : "s"} with actuals` : "Enter actuals after shipping"}
          />
        </div>
        <div className="card">
          <Stat
            size="lg"
            label="Margin drift (actual − quoted)"
            value={driftINR !== null ? formatINR(driftINR) : "—"}
            accent={driftINR !== null ? marginClass(driftINR) : "text-slate-400"}
            sub={
              driftINR !== null
                ? hasFx
                  ? `${formatINR(fxINR)} exchange rate · ${formatINR(driftINR - fxINR)} costs & price`
                  : "Add realised rates to split out currency"
                : "Appears once actuals exist"
            }
          />
        </div>
      </div>

      {!loading && nextSteps.length > 0 && (
        <Panel
          title={
            <>
              Next steps <Pill tone="warn">{nextSteps.length}</Pill>
            </>
          }
          description="What needs doing to keep the numbers complete."
        >
          <ul className="divide-y divide-line -my-1">
            {nextSteps.slice(0, 6).map((step) => (
              <li key={step.key} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-start gap-2.5 text-sm min-w-0">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-bronze" aria-hidden />
                  <span className="min-w-0">{step.text}</span>
                </span>
                <Link href={step.href} className="btn-secondary shrink-0 py-1.5 text-xs">
                  {step.action}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Shipment lines" description="One row per product on each shipment.">
        {loading ? (
          <LoadingState />
        ) : rows.length === 0 ? (
          <EmptyState title="No shipments yet">
            <Link href="/shipments" className="link">
              Create your first shipment
            </Link>{" "}
            to see cost and margin roll up here.
          </EmptyState>
        ) : (
          <>
          {/* Phones: one card per line */}
          <ul className="md:hidden space-y-3">
            {rows.map((r) => {
              const drift = r.actual && r.actualPriced && r.quotedPriced ? r.actual.totalMarginINR - r.quoted.totalMarginINR : null;
              return (
                <li key={r.itemId}>
                  <Link href={`/shipments/${r.shipment.id}`} className="block rounded-lg border border-line p-3.5 active:bg-canvas">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono text-[13px] font-medium">{r.shipment.code}</div>
                        <div className="text-sm font-medium truncate">{r.clientName}</div>
                        <div className="text-xs text-slate-500">{r.productName} · {r.quantity} MT</div>
                      </div>
                      <StatusBadge status={r.shipment.status} />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
                      <Stat
                        label="Quoted"
                        value={r.quotedPriced ? formatINR(r.quoted.totalMarginINR) : "No price"}
                        accent={r.quotedPriced ? marginClass(r.quoted.totalMargin) : "text-slate-400"}
                      />
                      <Stat
                        label="Actual"
                        value={r.actual && r.actualPriced ? formatINR(r.actual.totalMarginINR) : "—"}
                        accent={r.actual && r.actualPriced ? marginClass(r.actual.totalMargin) : "text-slate-400"}
                      />
                      <Stat label="Drift" value={drift !== null ? formatINR(drift) : "—"} accent={marginClass(drift)} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="hidden md:block overflow-x-auto -mx-5 px-5">
            <table className="data">
              <thead>
                <tr>
                  <th>Shipment</th>
                  <th>Client · product</th>
                  <th className="!text-right">Qty (MT)</th>
                  <th className="!text-right">Quoted margin</th>
                  <th className="!text-right">Actual margin</th>
                  <th className="!text-right">Drift</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const drift = r.actual && r.actualPriced && r.quotedPriced ? r.actual.totalMarginINR - r.quoted.totalMarginINR : null;
                  return (
                    <tr key={r.itemId}>
                      <td>
                        <div className="font-mono text-[13px] font-medium">{r.shipment.code}</div>
                        <div className="mt-1">
                          <StatusBadge status={r.shipment.status} />
                        </div>
                      </td>
                      <td>
                        <div className="font-medium">{r.clientName}</div>
                        <div className="text-xs text-slate-500">{r.productName}</div>
                      </td>
                      <td className="text-right">{r.quantity}</td>
                      <td className={`text-right font-medium ${r.quotedPriced ? marginClass(r.quoted.totalMargin) : "text-slate-400"}`}>
                        {r.quotedPriced ? (
                          <>
                            {formatMoney(r.quoted.totalMargin, r.shipment.currency)}
                            <div className="text-[11px] font-normal text-slate-500">
                              {formatINR(r.quoted.totalMarginINR)} @ ₹{r.quoted.rate}
                            </div>
                          </>
                        ) : (
                          <>
                            No price yet
                            <div className="text-[11px] font-normal text-slate-500">
                              Cost {formatMoney(r.quoted.costPerMTFx * r.quantity, r.shipment.currency)}
                            </div>
                          </>
                        )}
                      </td>
                      <td className={`text-right font-medium ${r.actualPriced ? marginClass(r.actual?.totalMargin) : "text-slate-400"}`}>
                        {r.actual && !r.actualPriced ? (
                          "No price yet"
                        ) : r.actual ? (
                          <>
                            {formatMoney(r.actual.totalMargin, r.shipment.currency)}
                            <div className="text-[11px] font-normal text-slate-500">
                              {formatINR(r.actual.totalMarginINR)} @ ₹{r.actual.rate}
                              {!r.shipment.actual_exchange_rate && " (quoted rate)"}
                            </div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`text-right font-medium ${marginClass(drift)}`}>
                        {drift !== null ? formatINR(drift) : "—"}
                        {r.fxEffect !== null && (
                          <div className="text-[11px] font-normal text-slate-500">{formatINR(r.fxEffect)} from FX</div>
                        )}
                      </td>
                      <td className="text-right">
                        <Link href={`/shipments/${r.shipment.id}`} className="link text-sm whitespace-nowrap">
                          Open →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Panel>
    </div>
  );
}
