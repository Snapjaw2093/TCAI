"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ChecklistPanel from "@/components/ChecklistPanel";
import DocumentList from "@/components/DocumentList";
import EmailsPanel from "@/components/EmailsPanel";
import ProgressBar from "@/components/ProgressBar";
import StatusBadge from "@/components/StatusBadge";
import { applyTemplate } from "@/lib/data/checklist";
import { buildSignature, buildWelcomeEmail } from "@/lib/templates/emails";
import { db } from "@/lib/data";
import { formatDate, formatPrice, relativeDays } from "@/lib/format";
import type {
  DocumentItem,
  EmailDraft,
  Person,
  Task,
  Transaction,
  TransactionStatus,
} from "@/lib/types";

type Loaded = {
  transaction: Transaction;
  people: Person[];
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
      // Links like /transactions/abc#emails open straight to that tab.
      const wanted = tabs.find((name) => name.toLowerCase() === window.location.hash.slice(1));
      if (wanted) setTab(wanted);
      const transaction = await db.getTransaction(id);
      if (!transaction) {
        setData(null);
        return;
      }
      const people = await db.listPeople();
      setData({
        transaction,
        people,
        client: people.find((p) => p.id === transaction.clientId),
        agent: people.find((p) => p.id === transaction.agentId),
        tasks: await db.listTasks(id),
        documents: await db.listDocuments(id),
        drafts: await db.listDrafts(id),
      });
    }
    load();
  }, [id]);

  async function updateTask(task: Task) {
    await db.saveTask(task);
    setData((d) => d && { ...d, tasks: d.tasks.map((x) => (x.id === task.id ? task : x)) });
  }

  async function updateDocument(doc: DocumentItem) {
    await db.saveDocument(doc);
    setData((d) => d && { ...d, documents: d.documents.map((x) => (x.id === doc.id ? doc : x)) });
  }

  async function updateStatus(status: TransactionStatus) {
    if (!data) return;
    const transaction = await db.saveTransaction({ ...data.transaction, status });
    setData({ ...data, transaction });
  }

  async function createWelcomeDraft(recipient: Person) {
    if (!data || !data.client || !data.agent) return;
    const content = buildWelcomeEmail(
      recipient,
      data.transaction,
      data.client,
      data.agent,
      data.documents,
      buildSignature(await db.getSettings()),
    );
    const draft = await db.saveDraft({
      transactionId: data.transaction.id,
      recipientId: recipient.id,
      kind: "welcome",
      ...content,
      status: "draft",
      createdAt: new Date().toISOString(),
      sentAt: null,
    });
    setData({ ...data, drafts: [...data.drafts, draft] });
  }

  async function updateDraft(draft: EmailDraft) {
    if (!data) return;
    await db.saveDraft(draft);
    let tasks = data.tasks;
    // Sending the welcome email also ticks off the matching checklist task.
    if (draft.status === "sent" && draft.kind === "welcome") {
      const task = tasks.find((x) => x.key === "welcome-email" && x.status === "open");
      if (task) {
        const done: Task = { ...task, status: "done" };
        await db.saveTask(done);
        tasks = tasks.map((x) => (x.id === done.id ? done : x));
      }
    }
    setData({ ...data, tasks, drafts: data.drafts.map((x) => (x.id === draft.id ? draft : x)) });
  }

  async function removeDraft(draft: EmailDraft) {
    if (!data) return;
    await db.deleteDraft(draft.id);
    setData({ ...data, drafts: data.drafts.filter((x) => x.id !== draft.id) });
  }

  async function generateChecklist() {
    if (!data) return;
    const { tasks, documents } = await applyTemplate(data.transaction);
    setData({ ...data, tasks, documents });
  }

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

  const { transaction: t, people, client, agent, tasks, documents, drafts } = data;
  const tasksDone = tasks.filter((x) => x.status !== "open").length;
  const requiredDocs = documents.filter((x) => x.required);
  const requiredReceived = requiredDocs.filter((x) => x.status === "received").length;
  const counts: Record<Tab, string | null> = {
    Overview: null,
    Checklist: tasks.length ? `${tasksDone}/${tasks.length}` : null,
    Documents: requiredDocs.length ? `${requiredReceived}/${requiredDocs.length}` : null,
    Emails: drafts.length ? String(drafts.length) : null,
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
        <select
          value={t.status}
          onChange={(e) => updateStatus(e.target.value as TransactionStatus)}
          aria-label="Change status"
          className="ml-auto rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
        >
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </select>
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
            <ProgressBar label="Tasks complete" done={tasksDone} total={tasks.length} />
            <ProgressBar
              label="Required documents received"
              done={requiredReceived}
              total={requiredDocs.length}
            />
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
      ) : tab === "Checklist" || tab === "Documents" ? (
        tasks.length === 0 && documents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <p className="font-medium text-slate-900">No checklist yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Build tasks and required documents from the {t.type} template.
            </p>
            <button
              onClick={generateChecklist}
              className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Generate checklist
            </button>
          </div>
        ) : tab === "Checklist" ? (
          <ChecklistPanel tasks={tasks} onChange={updateTask} />
        ) : (
          <DocumentList documents={documents} onChange={updateDocument} />
        )
      ) : (
        <EmailsPanel
          drafts={drafts}
          client={client}
          agent={agent}
          people={people}
          onCreateWelcome={createWelcomeDraft}
          onChange={updateDraft}
          onDelete={removeDraft}
        />
      )}
    </div>
  );
}
