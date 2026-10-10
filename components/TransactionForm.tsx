"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { db } from "@/lib/data";
import { applyTemplate } from "@/lib/data/checklist";
import type { Person, TransactionType } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

// Finds a saved person with this email, or saves them as new.
// This is how one agent can appear on many deals.
async function findOrCreatePerson(
  role: Person["role"],
  name: string,
  email: string,
  phone: string,
): Promise<Person> {
  const existing = (await db.listPeople()).find(
    (p) => p.role === role && p.email.toLowerCase() === email.toLowerCase(),
  );
  if (existing) return existing;
  return db.savePerson({ name, email, phone, role });
}

export default function TransactionForm() {
  const router = useRouter();
  const [type, setType] = useState<TransactionType>("buyer");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    const get = (key: string) => String(form.get(key) ?? "").trim();

    const required = ["propertyAddress", "clientName", "clientEmail", "agentName", "agentEmail"];
    if (required.some((key) => !get(key))) {
      setError("Please fill in the property address and the client and agent names and emails.");
      return;
    }

    setSaving(true);
    const client = await findOrCreatePerson("client", get("clientName"), get("clientEmail"), get("clientPhone"));
    const agent = await findOrCreatePerson("agent", get("agentName"), get("agentEmail"), get("agentPhone"));
    const price = get("price");

    const transaction = await db.saveTransaction({
      type,
      status: "active",
      propertyAddress: get("propertyAddress"),
      clientId: client.id,
      agentId: agent.id,
      contractDate: get("contractDate") || null,
      closingDate: get("closingDate") || null,
      price: price ? Number(price) : null,
      notes: get("notes"),
      createdAt: new Date().toISOString().slice(0, 10),
    });
    await applyTemplate(transaction);
    router.push(`/transactions/${transaction.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-medium text-slate-900">Property</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Who is our client?">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TransactionType)}
              className={inputClass}
            >
              <option value="buyer">Buyer</option>
              <option value="seller">Seller</option>
            </select>
          </Field>
          <Field label="Property address">
            <input name="propertyAddress" className={inputClass} />
          </Field>
          <Field label="Contract date">
            <input name="contractDate" type="date" className={inputClass} />
          </Field>
          <Field label="Closing date">
            <input name="closingDate" type="date" className={inputClass} />
          </Field>
          <Field label="Price (optional)">
            <input name="price" type="number" min="0" className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-medium text-slate-900">Client</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name">
            <input name="clientName" className={inputClass} />
          </Field>
          <Field label="Email">
            <input name="clientEmail" type="email" className={inputClass} />
          </Field>
          <Field label="Phone (optional)">
            <input name="clientPhone" type="tel" className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-medium text-slate-900">Agent</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name">
            <input name="agentName" className={inputClass} />
          </Field>
          <Field label="Email">
            <input name="agentEmail" type="email" className={inputClass} />
          </Field>
          <Field label="Phone (optional)">
            <input name="agentPhone" type="tel" className={inputClass} />
          </Field>
        </div>
        <p className="text-xs text-slate-500">
          If an agent or client with the same email is already saved, we reuse them.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <Field label="Notes (optional)">
          <textarea name="notes" rows={3} className={inputClass} />
        </Field>
      </section>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Create transaction"}
      </button>
    </form>
  );
}
