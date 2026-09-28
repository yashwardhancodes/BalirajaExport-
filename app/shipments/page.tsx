"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createShipment, listClients, listShipments } from "@/lib/actions";
import { Client, COMMON_CURRENCIES, Shipment } from "@/lib/types";
import { EmptyState, ErrorText, Field, LoadingState, PageHeader, Panel, StatusBadge } from "@/components/ui";

const EMPTY_FORM = {
  code: "",
  client_id: "",
  incoterm: "",
  port_of_loading: "Nhava Sheva",
  port_of_discharge: "",
  currency: "USD",
  exchange_rate: "",
};

export default function ShipmentsPage() {
  const router = useRouter();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    (async () => {
      const [s, c] = await Promise.all([listShipments(), listClients()]);
      setShipments(s);
      setClients(c);
      setLoading(false);
    })();
  }, []);

  async function addShipment(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const id = await createShipment({
        code: form.code.trim(),
        client_id: form.client_id || null,
        incoterm: form.incoterm.trim() || null,
        port_of_loading: form.port_of_loading.trim() || null,
        port_of_discharge: form.port_of_discharge.trim() || null,
        currency: form.currency || "USD",
        exchange_rate: Number(form.exchange_rate),
      });
      router.push(`/shipments/${id}`); // straight on to adding products and costs
    } catch {
      setError(`Couldn't create the shipment. Check that the code "${form.code.trim()}" isn't already used.`);
      setSaving(false);
    }
  }

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? "No client";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Shipments"
        description="Each shipment moves Quoted → Confirmed → Produced → Shipped → Completed. Quoted figures lock once it's confirmed."
      />

      <Panel title="New shipment" description="You'll add products, port & freight and prices on the next screen.">
        <form onSubmit={addShipment} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Shipment code" htmlFor="new-code">
            <input id="new-code" className="input font-mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="EXP-2026-002" required />
          </Field>
          <Field label="Client" htmlFor="new-client">
            <select id="new-client" className="input" value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
              <option value="">Select client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Incoterm" htmlFor="new-incoterm">
            <input id="new-incoterm" className="input" value={form.incoterm} onChange={(e) => setForm({ ...form, incoterm: e.target.value })} placeholder="CFR Jebel Ali" />
          </Field>
          <Field label="Port of loading" htmlFor="new-pol">
            <input id="new-pol" className="input" value={form.port_of_loading} onChange={(e) => setForm({ ...form, port_of_loading: e.target.value })} />
          </Field>
          <Field label="Port of discharge" htmlFor="new-pod">
            <input id="new-pod" className="input" value={form.port_of_discharge} onChange={(e) => setForm({ ...form, port_of_discharge: e.target.value })} />
          </Field>
          <Field label="Client price currency" htmlFor="new-currency">
            <select id="new-currency" className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {COMMON_CURRENCIES.filter((c) => c !== "INR").map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label={`Quoted rate (₹ per 1 ${form.currency})`} htmlFor="new-rate">
            <input id="new-rate" className="input" type="number" step="0.0001" min="0.0001" value={form.exchange_rate} onChange={(e) => setForm({ ...form, exchange_rate: e.target.value })} placeholder="e.g. 84.20" required />
          </Field>
          <div className="flex items-end">
            <button className="btn w-full sm:w-auto" disabled={saving}>{saving ? "Creating…" : "Create shipment"}</button>
          </div>
          {error && <div className="sm:col-span-2 lg:col-span-4"><ErrorText>{error}</ErrorText></div>}
        </form>
      </Panel>

      <Panel title="All shipments">
        {loading ? (
          <LoadingState />
        ) : shipments.length === 0 ? (
          <EmptyState title="No shipments yet">Create your first one above.</EmptyState>
        ) : (
          <>
          <ul className="md:hidden divide-y divide-line -my-2">
            {shipments.map((s) => (
              <li key={s.id}>
                <Link href={`/shipments/${s.id}`} className="flex items-center justify-between gap-3 py-3 active:bg-canvas">
                  <span className="min-w-0">
                    <span className="block font-mono text-[13px] font-medium">{s.code}</span>
                    <span className="block text-sm truncate">{clientName(s.client_id)}</span>
                    <span className="block text-xs text-slate-500 truncate">
                      {[s.incoterm, s.port_of_discharge].filter(Boolean).join(" · ") || "No route set"} · {s.currency} @ ₹{s.exchange_rate}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={s.status} />
                    <span className="text-slate-400" aria-hidden>›</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden md:block overflow-x-auto -mx-5 px-5">
            <table className="data">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Incoterm</th>
                  <th>Route</th>
                  <th className="!text-right">Rate</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s) => (
                  <tr key={s.id} className="cursor-pointer" onClick={() => router.push(`/shipments/${s.id}`)}>
                    <td className="font-mono text-[13px] font-medium">{s.code}</td>
                    <td>{clientName(s.client_id)}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td>{s.incoterm ?? <span className="text-slate-400">—</span>}</td>
                    <td className="text-slate-600">
                      {s.port_of_loading || s.port_of_discharge ? `${s.port_of_loading ?? "?"} → ${s.port_of_discharge ?? "?"}` : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {s.currency} @ ₹{s.exchange_rate}
                    </td>
                    <td className="text-right">
                      <Link href={`/shipments/${s.id}`} className="link text-sm whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        Open →
                      </Link>
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
