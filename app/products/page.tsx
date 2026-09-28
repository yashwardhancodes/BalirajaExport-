"use client";

import { useEffect, useState } from "react";
import { createProduct, deleteProduct, listProducts, updateProduct } from "@/lib/actions";
import { DEFAULT_POUCH_KG, Product } from "@/lib/types";
import { EmptyState, ErrorText, Field, LoadingState, PageHeader, Panel, Pill } from "@/components/ui";

const EMPTY_FORM = {
  name: "",
  unit: "KG",
  standard_pack_kg: String(DEFAULT_POUCH_KG),
  default_pouches_per_carton: "",
  default_sorting_loss_pct: "",
  category: "",
};

function toForm(p: Product): typeof EMPTY_FORM {
  return {
    name: p.name,
    unit: p.unit,
    standard_pack_kg: p.standard_pack_kg != null ? String(p.standard_pack_kg) : "",
    default_pouches_per_carton: p.default_pouches_per_carton != null ? String(p.default_pouches_per_carton) : "",
    default_sorting_loss_pct: p.default_sorting_loss_pct != null ? String(p.default_sorting_loss_pct) : "",
    category: p.category ?? "",
  };
}

const NOT_SET = <Pill tone="warn">Not set</Pill>;

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setProducts(await listProducts());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(p: Product) {
    setEditingId(p.id);
    setForm(toForm(p));
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    const data = {
      name: form.name.trim(),
      unit: form.unit || "KG",
      standard_pack_kg: form.standard_pack_kg ? Number(form.standard_pack_kg) : null,
      default_pouches_per_carton: form.default_pouches_per_carton ? Number(form.default_pouches_per_carton) : null,
      default_sorting_loss_pct: form.default_sorting_loss_pct ? Number(form.default_sorting_loss_pct) : null,
      category: form.category.trim() || null,
    };
    try {
      if (editingId) await updateProduct(editingId, data);
      else await createProduct(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    } finally {
      setSaving(false);
    }
    cancelEdit();
    load();
  }

  async function removeProduct(id: string) {
    if (!confirm("Delete this product? This also removes its rate history.")) return;
    setError(null);
    try {
      await deleteProduct(id);
    } catch {
      setError("This product is used on a shipment line — remove it from those shipments first.");
      return;
    }
    if (editingId === id) cancelEdit();
    load();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Rate book"
        title="Products"
        description="The catalogue every rate, cost and quote is built on. Pack size and sorting loss here are defaults for new shipment lines."
      />

      <Panel
        title={editingId ? `Edit ${products.find((p) => p.id === editingId)?.name ?? "product"}` : "Add product"}
        className={editingId ? "ring-2 ring-brand/30" : ""}
        actions={editingId ? <button type="button" onClick={cancelEdit} className="btn-ghost">Cancel</button> : undefined}
      >
        <form onSubmit={saveProduct} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Name" htmlFor="product-name" className="col-span-2">
            <input id="product-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="IQF Green Peas" required />
          </Field>
          <Field label="Unit" htmlFor="product-unit">
            <input id="product-unit" className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </Field>
          <Field label="Category" htmlFor="product-category">
            <input id="product-category" className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Frozen" />
          </Field>
          <Field label="Export pouch (kg net)" htmlFor="product-pouch">
            <input id="product-pouch" className="input" type="number" step="0.01" min="0" value={form.standard_pack_kg} onChange={(e) => setForm({ ...form, standard_pack_kg: e.target.value })} />
          </Field>
          <Field label="Pouches per carton" htmlFor="product-ppc">
            <input id="product-ppc" className="input" type="number" step="1" min="1" value={form.default_pouches_per_carton} onChange={(e) => setForm({ ...form, default_pouches_per_carton: e.target.value })} placeholder="8" />
          </Field>
          <Field label="Typical sorting loss (%)" htmlFor="product-loss">
            <input id="product-loss" className="input" type="number" step="0.01" min="0" max="99.99" value={form.default_sorting_loss_pct} onChange={(e) => setForm({ ...form, default_sorting_loss_pct: e.target.value })} placeholder="5" />
          </Field>
          <div className="flex items-end col-span-2 sm:col-span-1">
            <button className="btn w-full sm:w-auto" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Add product"}</button>
          </div>
          <p className="col-span-2 lg:col-span-4 text-xs text-slate-500">
            Editing a product changes the defaults for new shipment lines only. Lines already added keep their own figures.
          </p>
          {error && <div className="col-span-2 lg:col-span-4"><ErrorText>{error}</ErrorText></div>}
        </form>
      </Panel>

      <Panel title="All products">
        {loading ? (
          <LoadingState />
        ) : products.length === 0 ? (
          <EmptyState title="No products yet">Add your first one above.</EmptyState>
        ) : (
          <>
          <ul className="md:hidden divide-y divide-line -my-2">
            {products.map((p) => (
              <li key={p.id} className={`py-3 ${editingId === p.id ? "bg-brand-soft/60 -mx-4 px-4" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.category ?? "No category"} · {p.unit}</div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => startEdit(p)} className="btn-secondary py-1.5 text-xs">Edit</button>
                    <button onClick={() => removeProduct(p.id)} className="btn-danger-ghost">Delete</button>
                  </div>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-slate-500">Pouch</dt><dd className="figure font-medium">{p.standard_pack_kg ? `${p.standard_pack_kg} kg` : NOT_SET}</dd></div>
                  <div><dt className="text-slate-500">Per carton</dt><dd className="figure font-medium">{p.default_pouches_per_carton ?? NOT_SET}</dd></div>
                  <div><dt className="text-slate-500">Sorting loss</dt><dd className="figure font-medium">{p.default_sorting_loss_pct != null ? `${p.default_sorting_loss_pct}%` : NOT_SET}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
          <div className="hidden md:block overflow-x-auto -mx-5 px-5">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Unit</th>
                  <th className="!text-right">Export pouch</th>
                  <th className="!text-right">Carton</th>
                  <th className="!text-right">Sorting loss</th>
                  <th>Category</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className={editingId === p.id ? "bg-brand-soft/60" : undefined}>
                    <td className="font-medium">{p.name}</td>
                    <td>{p.unit}</td>
                    <td className="text-right">{p.standard_pack_kg ? `${p.standard_pack_kg} kg` : NOT_SET}</td>
                    <td className="text-right">
                      {p.default_pouches_per_carton ? (
                        <>
                          {p.default_pouches_per_carton} pouches
                          {p.standard_pack_kg && (
                            <div className="text-[11px] text-slate-500">
                              {+(p.standard_pack_kg * p.default_pouches_per_carton).toFixed(3)} kg per carton
                            </div>
                          )}
                        </>
                      ) : (
                        NOT_SET
                      )}
                    </td>
                    <td className="text-right">{p.default_sorting_loss_pct != null ? `${p.default_sorting_loss_pct}%` : NOT_SET}</td>
                    <td>{p.category ?? <span className="text-slate-400">—</span>}</td>
                    <td className="text-right whitespace-nowrap">
                      <button onClick={() => startEdit(p)} className="btn-ghost text-xs">Edit</button>
                      <button onClick={() => removeProduct(p.id)} className="btn-danger-ghost">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Panel>
    </div>
  );
}
