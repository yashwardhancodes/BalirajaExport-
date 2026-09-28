"use client";

import { useEffect, useState } from "react";
import { createSupplier, createSupplierRate, listProducts, listSupplierRates, listSuppliers } from "@/lib/actions";
import { Product, Supplier, SupplierRate } from "@/lib/types";
import { formatINR } from "@/lib/calc";
import { EmptyState, ErrorText, Field, LoadingState, PageHeader, Panel } from "@/components/ui";

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY_SUPPLIER = { name: "", contact: "", location: "" };

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [rates, setRates] = useState<SupplierRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [supplierForm, setSupplierForm] = useState(EMPTY_SUPPLIER);
  const [rateForm, setRateForm] = useState({ supplier_id: "", product_id: "", rate_per_kg: "", moq_kg: "", effective_date: today(), notes: "" });

  async function load() {
    const [s, p, r] = await Promise.all([listSuppliers(), listProducts(), listSupplierRates()]);
    setSuppliers(s);
    setProducts(p);
    setRates(r);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function addSupplier(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierForm.name.trim()) return;
    run(async () => {
      await createSupplier({
        name: supplierForm.name.trim(),
        contact: supplierForm.contact.trim() || null,
        location: supplierForm.location.trim() || null,
      });
      setSupplierForm(EMPTY_SUPPLIER);
    });
  }

  function addRate(e: React.FormEvent) {
    e.preventDefault();
    if (!rateForm.supplier_id || !rateForm.product_id || !rateForm.rate_per_kg) return;
    run(async () => {
      await createSupplierRate({
        supplier_id: rateForm.supplier_id,
        product_id: rateForm.product_id,
        rate_per_kg: Number(rateForm.rate_per_kg),
        moq_kg: rateForm.moq_kg ? Number(rateForm.moq_kg) : null,
        effective_date: rateForm.effective_date,
        notes: rateForm.notes.trim() || null,
      });
      setRateForm({ ...rateForm, rate_per_kg: "", moq_kg: "", notes: "" });
    });
  }

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "—";
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "—";

  // Current market per product: each supplier's latest rate only (rates arrive newest first).
  const currentByProduct = products.map((product) => {
    const latest = new Map<string, SupplierRate>();
    for (const r of rates) if (r.product_id === product.id && !latest.has(r.supplier_id)) latest.set(r.supplier_id, r);
    const current = Array.from(latest.values()).sort((a, b) => a.rate_per_kg - b.rate_per_kg);
    return { product, current };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Rate book"
        title="Suppliers & rates"
        description="Bulk rates in ₹/kg at the supplier, before transport and sorting loss. Rates are dated and never overwritten; the latest one becomes the quoted raw material cost when you add a product to a shipment."
      />

      <Panel title="Current bulk rates" description="Each supplier's latest rate per product, cheapest first.">
        {loading ? (
          <LoadingState />
        ) : products.length === 0 ? (
          <EmptyState title="No products yet">Add products first, then log supplier rates for them.</EmptyState>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {currentByProduct.map(({ product, current }) => (
              <div key={product.id} className="rounded-lg border border-line p-4 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium">{product.name}</div>
                  <div className="text-[11px] text-slate-500">{current.length} supplier{current.length === 1 ? "" : "s"}</div>
                </div>
                {current.length === 0 ? (
                  <div className="text-sm text-slate-400">No rates logged</div>
                ) : (
                  <>
                    <div className="figure text-xl font-semibold text-brand">
                      {current.length === 1 || current[0].rate_per_kg === current[current.length - 1].rate_per_kg
                        ? `${formatINR(current[0].rate_per_kg)}/kg`
                        : `${formatINR(current[0].rate_per_kg)} – ${formatINR(current[current.length - 1].rate_per_kg)}/kg`}
                    </div>
                    <ul className="space-y-1 text-xs">
                      {current.map((r) => (
                        <li key={r.id} className="flex justify-between gap-2 text-slate-600">
                          <span className="truncate">{supplierName(r.supplier_id)}</span>
                          <span className="figure whitespace-nowrap">
                            {formatINR(r.rate_per_kg)} · {r.effective_date}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <Panel title="Log a rate" description="Log a new rate whenever a supplier's price changes.">
          <form onSubmit={addRate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Supplier" htmlFor="rate-supplier">
              <select id="rate-supplier" className="input" value={rateForm.supplier_id} onChange={(e) => setRateForm({ ...rateForm, supplier_id: e.target.value })} required>
                <option value="">Select supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Product" htmlFor="rate-product">
              <select id="rate-product" className="input" value={rateForm.product_id} onChange={(e) => setRateForm({ ...rateForm, product_id: e.target.value })} required>
                <option value="">Select product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Bulk rate (₹/kg)" htmlFor="rate-value">
              <input id="rate-value" className="input" type="number" step="0.01" min="0" value={rateForm.rate_per_kg} onChange={(e) => setRateForm({ ...rateForm, rate_per_kg: e.target.value })} required />
            </Field>
            <Field label="MOQ (kg)" htmlFor="rate-moq">
              <input id="rate-moq" className="input" type="number" step="1" min="0" value={rateForm.moq_kg} onChange={(e) => setRateForm({ ...rateForm, moq_kg: e.target.value })} />
            </Field>
            <Field label="Effective date" htmlFor="rate-date">
              <input id="rate-date" className="input" type="date" value={rateForm.effective_date} onChange={(e) => setRateForm({ ...rateForm, effective_date: e.target.value })} required />
            </Field>
            <Field label="Notes" htmlFor="rate-notes">
              <input id="rate-notes" className="input" value={rateForm.notes} onChange={(e) => setRateForm({ ...rateForm, notes: e.target.value })} placeholder="Grade, payment terms…" />
            </Field>
            <div className="sm:col-span-2">
              <button className="btn">Log rate</button>
            </div>
          </form>
        </Panel>

        <Panel title="Add supplier">
          <form onSubmit={addSupplier} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Name" htmlFor="supplier-name" className="sm:col-span-2">
              <input id="supplier-name" className="input" value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} required />
            </Field>
            <Field label="Contact" htmlFor="supplier-contact">
              <input id="supplier-contact" className="input" value={supplierForm.contact} onChange={(e) => setSupplierForm({ ...supplierForm, contact: e.target.value })} placeholder="+91 …" />
            </Field>
            <Field label="Location" htmlFor="supplier-location">
              <input id="supplier-location" className="input" value={supplierForm.location} onChange={(e) => setSupplierForm({ ...supplierForm, location: e.target.value })} placeholder="Gwalior" />
            </Field>
            <div className="sm:col-span-2">
              <button className="btn-secondary">Add supplier</button>
            </div>
          </form>
        </Panel>
      </div>
      {error && <ErrorText>Couldn&apos;t save: {error}</ErrorText>}

      <Panel title="Rate history" description="Every rate ever logged, newest first.">
        {loading ? (
          <LoadingState />
        ) : rates.length === 0 ? (
          <EmptyState title="No rates logged yet" />
        ) : (
          <div className="overflow-x-auto -mx-4 px-4 sm:-mx-5 sm:px-5">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th>Product</th>
                  <th className="!text-right">Rate</th>
                  <th className="!text-right">MOQ</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id}>
                    <td className="figure whitespace-nowrap">{r.effective_date}</td>
                    <td className="font-medium">{supplierName(r.supplier_id)}</td>
                    <td>{productName(r.product_id)}</td>
                    <td className="text-right whitespace-nowrap">{formatINR(r.rate_per_kg)}/kg</td>
                    <td className="text-right whitespace-nowrap">{r.moq_kg ? `${r.moq_kg.toLocaleString("en-IN")} kg` : <span className="text-slate-400">—</span>}</td>
                    <td className="text-slate-600">{r.notes ?? <span className="text-slate-400">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
