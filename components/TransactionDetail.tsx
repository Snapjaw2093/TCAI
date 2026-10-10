"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { db } from "@/lib/data";
import { formatDate, formatPrice, relativeDays } from "@/lib/format";
import type {
  DocumentItem,
  EmailDraft,
  Person,
  Task,
  Transaction,
} from "@/lib/types";

type Loaded = {
  transaction: Transaction;
  client: Person | undefined;
  agent: Person | undefined;
  tasks: Task[];
  documents: DocumentItem[];
  drafts: EmailDraft[];
};

const tabs = ["Overview", "Checklist", "Documents", "Emails"] as const;
type Tab = (typeof tabs)[number];

function PersonCard({ title, person }: { title: string; person?: Person }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      {person ? (
        <>
          <p className="mt-1 font-medium text-slate-900">{person.name}</p>
          <p className="text-sm text-slate-600">{person.email}</p>
          {person.phone && <p className="text-sm text-slate-600">{person.phone}</p>}
        </>
      ) : (
        <p className="mt-1 text-sm text-slate-500">Not found</p>
      )}
    </div>
  );
}

function DateCard({ title, date }: { title: string; date: string | null }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-1 font-medium text-slate-900">{formatDate(date)}</p>
      {date && <p className="text-sm text-slate-600">{relativeDays(date)}</p>}
    </div>
  );
}

export default function TransactionDetail({ id }: { id: string }) {
  const [data, setData] = useState<Loaded | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("Overview");

  useEffect(() => {
    async function load() {
      const transaction = await db.getTransaction(id);
      if (!transaction) {
        setData(null);
        return;
      }
      const people = await db.listPeople();
      setData({
        transaction,
        client: people.find((p) => p.id === transaction.clientId),
        agent: people.find((p) => p.id === transaction.agentId),
        tasks: await db.listTasks(id),
        documents: await db.listDocuments(id),
        drafts: await db.listDrafts(id),
      });
    }
    load();
  }, [id]);

  if (data === undefined) return <p className="text-sm text-slate-500">Loading…</p>;

  if (data === null) {
    return (
      <div>
        <p className="text-slate-700">We couldn&apos;t find that transaction.</p>
        <Link href="/transactions" className="text-sm text-indigo-600 hover:underline">
          Back to transactions
        </Link>
      </div>
    );
  }

  const { transaction: t, client, agent, tasks, documents, drafts } = data;
  const counts: Record<Tab, number | null> = {
    Overview: null,
    Checklist: tasks.length,
    Documents: documents.length,
    Emails: drafts.length,
  };

  return (
    <div>
      <Link href="/transactions" className="text-sm text-slate-500 hover:text-slate-900">
        ← All transactions
      </Link>
      <div className="mb-6 mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">{t.propertyAddress}</h1>
        <StatusBadge status={t.status} />
        <span className="text-sm text-slate-500">
          {t.type === "buyer" ? "Buyer side" : "Seller side"}
        </span>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((name) => (
          <button
            key={name}
            onClick={() => setTab(name)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${
              tab === name
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            {name}
            {counts[name] !== null && (
              <span className="ml-1.5 text-xs text-slate-400">{counts[name]}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "Overview" ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <PersonCard title="Client" person={client} />
            <PersonCard title="Agent" person={agent} />
            <DateCard title="Contract date" date={t.contractDate} />
            <DateCard title="Closing date" date={t.closingDate} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Price</p>
            <p className="mt-1 font-medium text-slate-900">{formatPrice(t.price)}</p>
            {t.notes && (
              <>
                <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Notes
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{t.notes}</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="font-medium text-slate-900">{tab} are coming in the next stage</p>
          <p className="mt-1 text-sm text-slate-500">
            This deal has {counts[tab]} saved so far.
          </p>
        </div>
      )}
    </div>
  );
}
