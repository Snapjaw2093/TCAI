"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import { db } from "@/lib/data";
import { formatDate, relativeDays } from "@/lib/format";
import type { Person, Transaction, TransactionStatus } from "@/lib/types";

export default function TransactionList() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TransactionStatus | "all">("all");

  useEffect(() => {
    async function load() {
      setTransactions(await db.listTransactions());
      setPeople(await db.listPeople());
    }
    load();
  }, []);

  if (!transactions) return <p className="text-sm text-slate-500">Loading…</p>;

  if (transactions.length === 0) {
    return (
      <EmptyState
        title="No transactions yet"
        description="Create your first transaction to get started."
      />
    );
  }

  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Unknown";
  const q = search.trim().toLowerCase();
  const visible = transactions.filter(
    (t) =>
      (status === "all" || t.status === status) &&
      (!q ||
        t.propertyAddress.toLowerCase().includes(q) ||
        nameOf(t.clientId).toLowerCase().includes(q)),
  );

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by address or client"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:max-w-xs"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as TransactionStatus | "all")}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-slate-500">No transactions match your search.</p>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {visible.map((t) => (
            <li key={t.id}>
              <Link
                href={`/transactions/${t.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{t.propertyAddress}</p>
                  <p className="mt-0.5 truncate text-sm text-slate-500">
                    {nameOf(t.clientId)} · {t.type === "buyer" ? "Buyer" : "Seller"} side
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <StatusBadge status={t.status} />
                  <p className="mt-1 text-xs text-slate-500">
                    {t.closingDate
                      ? `Closes ${formatDate(t.closingDate)} (${relativeDays(t.closingDate)})`
                      : "No closing date"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
