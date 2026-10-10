"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import EmptyState from "@/components/EmptyState";
import { ErrorPanel, Loading } from "@/components/LoadState";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";
import { db } from "@/lib/data";
import { formatDate, relativeDays } from "@/lib/format";
import { nextAction, type NextAction } from "@/lib/nextAction";
import { useLoad } from "@/lib/useLoad";
import type { Transaction, TransactionStatus, TransactionType } from "@/lib/types";

type Sort = "urgent" | "closing" | "newest";

const selectClass = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

function NextActionCell({ action }: { action: NextAction | null }) {
  if (!action) return <span className="text-slate-400">Nothing scheduled</span>;
  const late = action.daysUntil !== null && action.daysUntil < 0;
  return (
    <div className="min-w-0">
      <p className="truncate text-sm text-slate-900">{action.label}</p>
      {action.dueDate && (
        <p className={`text-xs ${late ? "font-medium text-rose-600" : "text-slate-500"}`}>
          {late ? "Overdue · " : ""}
          {formatDate(action.dueDate)} ({relativeDays(action.dueDate)})
        </p>
      )}
    </div>
  );
}

export default function TransactionList() {
  const toast = useToast();
  const loader = useCallback(async () => {
    const [transactions, people, tasks, documents] = await Promise.all([
      db.listTransactions(),
      db.listPeople(),
      db.listTasks(),
      db.listDocuments(),
    ]);
    return { transactions, people, tasks, documents };
  }, []);
  const { data, error, loading, reload, update } = useLoad(loader);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TransactionStatus | "all">("all");
  const [type, setType] = useState<TransactionType | "all">("all");
  const [agentId, setAgentId] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<Sort>("urgent");

  if (error && !data) return <ErrorPanel message={error} onRetry={reload} />;
  if (loading || !data) return <Loading label="Loading transactions…" />;

  const { transactions, people, tasks, documents } = data;
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Unknown";
  const agents = people.filter((p) => p.role === "agent");
  const archivedCount = transactions.filter((t) => t.archived).length;

  async function setArchived(t: Transaction, archived: boolean) {
    try {
      const saved = await db.saveTransaction({ ...t, archived });
      update((d) => ({ ...d, transactions: d.transactions.map((x) => (x.id === saved.id ? saved : x)) }));
      toast(archived ? `Archived ${t.propertyAddress}.` : `Restored ${t.propertyAddress}.`);
    } catch (e) {
      toast(`Couldn't ${archived ? "archive" : "restore"} it: ${e instanceof Error ? e.message : "unknown error"}`, "error");
    }
  }

  if (transactions.length === 0) {
    return (
      <EmptyState
        title="No transactions yet"
        description="Create your first transaction to get started."
      />
    );
  }

  const q = search.trim().toLowerCase();
  const rows = transactions
    .filter(
      (t) =>
        (showArchived || !t.archived) &&
        (status === "all" || t.status === status) &&
        (type === "all" || t.type === type) &&
        (agentId === "all" || t.agentId === agentId) &&
        (!q ||
          t.propertyAddress.toLowerCase().includes(q) ||
          nameOf(t.clientId).toLowerCase().includes(q) ||
          nameOf(t.agentId).toLowerCase().includes(q)),
    )
    .map((t) => ({ t, action: nextAction(t, tasks, documents) }))
    .sort((a, b) => {
      if (sort === "closing") return (a.t.closingDate ?? "9999").localeCompare(b.t.closingDate ?? "9999");
      if (sort === "newest") return b.t.createdAt.localeCompare(a.t.createdAt);
      return (a.action?.daysUntil ?? 99999) - (b.action?.daysUntil ?? 99999);
    });

  const typeLabel = (t: Transaction) => (t.type === "buyer" ? "Buyer" : "Seller");

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search address, client, or agent"
          aria-label="Search transactions"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm lg:max-w-xs"
        />
        <div className="flex flex-wrap gap-2">
          <select value={status} onChange={(e) => setStatus(e.target.value as TransactionStatus | "all")} aria-label="Filter by status" className={selectClass}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="closed">Closed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select value={type} onChange={(e) => setType(e.target.value as TransactionType | "all")} aria-label="Filter by type" className={selectClass}>
            <option value="all">Buyer & seller</option>
            <option value="buyer">Buyer side</option>
            <option value="seller">Seller side</option>
          </select>
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)} aria-label="Filter by agent" className={selectClass}>
            <option value="all">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by" className={selectClass}>
            <option value="urgent">Most urgent first</option>
            <option value="closing">Closing date</option>
            <option value="newest">Newest first</option>
          </select>
        </div>
        <label className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-600 lg:ml-auto">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4 accent-indigo-600"
          />
          Show archived{archivedCount > 0 ? ` (${archivedCount})` : ""}
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
          No transactions match these filters.
        </p>
      ) : (
        <>
          {/* Wide screens: a table */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Property</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Agent</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Next action</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ t, action }) => (
                  <tr key={t.id} className={t.archived ? "bg-slate-50 text-slate-500" : "hover:bg-slate-50"}>
                    <td className="px-4 py-3">
                      <Link href={`/transactions/${t.id}`} className="font-medium text-slate-900 hover:text-indigo-700">
                        {t.propertyAddress}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {t.closingDate ? `Closes ${formatDate(t.closingDate)}` : "No closing date"}
                      </p>
                    </td>
                    <td className="px-4 py-3">{nameOf(t.clientId)}</td>
                    <td className="px-4 py-3">{nameOf(t.agentId)}</td>
                    <td className="px-4 py-3">{typeLabel(t)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={t.status} />
                      {t.archived && <span className="ml-1.5 text-xs text-slate-500">Archived</span>}
                    </td>
                    <td className="max-w-[16rem] px-4 py-3">
                      <NextActionCell action={action} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Link href={`/transactions/${t.id}`} className="text-sm text-indigo-600 hover:underline">
                        View
                      </Link>
                      <button
                        onClick={() => setArchived(t, !t.archived)}
                        className="ml-3 text-sm text-slate-500 hover:text-slate-900"
                      >
                        {t.archived ? "Restore" : "Archive"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phones: one card per deal */}
          <ul className="space-y-3 md:hidden">
            {rows.map(({ t, action }) => (
              <li key={t.id} className={`rounded-xl border border-slate-200 p-4 ${t.archived ? "bg-slate-50" : "bg-white"}`}>
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/transactions/${t.id}`} className="font-medium text-slate-900">
                    {t.propertyAddress}
                  </Link>
                  <StatusBadge status={t.status} />
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {nameOf(t.clientId)} · {typeLabel(t)} side · Agent: {nameOf(t.agentId)}
                </p>
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Next action</p>
                  <NextActionCell action={action} />
                </div>
                <div className="mt-3 flex gap-4 text-sm">
                  <Link href={`/transactions/${t.id}`} className="text-indigo-600">
                    View
                  </Link>
                  <button onClick={() => setArchived(t, !t.archived)} className="text-slate-500">
                    {t.archived ? "Restore" : "Archive"}
                  </button>
                  {t.archived && <span className="text-slate-400">Archived</span>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
