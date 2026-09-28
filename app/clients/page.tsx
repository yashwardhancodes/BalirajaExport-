"use client";

import { useEffect, useState } from "react";
import { createClient, listClients } from "@/lib/actions";
import { Client } from "@/lib/types";
import { EmptyState, ErrorText, Field, LoadingState, PageHeader, Panel } from "@/components/ui";

const EMPTY_FORM = { name: "", country: "", contact: "" };

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setClients(await listClients());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addClient(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createClient({
        name: form.name.trim(),
        country: form.country.trim() || null,
        contact: form.contact.trim() || null,
      });
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Rate book" title="Clients" description="Buyers you quote and ship to." />

      <Panel title="Add client">
        <form onSubmit={addClient} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <Field label="Name" htmlFor="client-name">
            <input id="client-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Al Noor Foodstuff Trading" required />
          </Field>
          <Field label="Country" htmlFor="client-country">
            <input id="client-country" className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="UAE" />
          </Field>
          <Field label="Contact" htmlFor="client-contact">
            <input id="client-contact" className="input" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Name, phone or email" />
          </Field>
          <div>
            <button className="btn w-full sm:w-auto" disabled={saving}>{saving ? "Adding…" : "Add client"}</button>
          </div>
          {error && <div className="sm:col-span-2 lg:col-span-4"><ErrorText>Couldn&apos;t add the client: {error}</ErrorText></div>}
        </form>
      </Panel>

      <Panel title="All clients">
        {loading ? (
          <LoadingState />
        ) : clients.length === 0 ? (
          <EmptyState title="No clients yet">Add your first buyer above.</EmptyState>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4 sm:-mx-5 sm:px-5">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Country</th>
                  <th>Contact</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.name}</td>
                    <td>{c.country ?? <span className="text-slate-400">—</span>}</td>
                    <td className="text-slate-600">{c.contact ?? <span className="text-slate-400">—</span>}</td>
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
