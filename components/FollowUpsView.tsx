"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import EmptyState from "@/components/EmptyState";
import { db } from "@/lib/data";
import { createDraft } from "@/lib/data/drafts";
import { findFollowUps, type FollowUpItem } from "@/lib/followups";
import { dueLabel, formatDate } from "@/lib/format";
import { buildFollowUpEmail, buildSignature } from "@/lib/templates/emails";
import type {
  DocumentItem,
  EmailDraft,
  Person,
  Task,
  Transaction,
} from "@/lib/types";

type Loaded = {
  transactions: Transaction[];
  people: Person[];
  tasks: Task[];
  documents: DocumentItem[];
  drafts: EmailDraft[];
};

// Client emails only cover documents and the closing date, not internal tasks.
const clientHasItems = (items: FollowUpItem[]) =>
  items.some((i) => i.kind !== "task");

const kindLabel = { task: "Task", document: "Document", closing: "Closing" };

function ItemRow({
  item,
  onTaskDone,
  onDocumentStatus,
}: {
  item: FollowUpItem;
  onTaskDone: (task: Task) => void;
  onDocumentStatus: (doc: DocumentItem, status: DocumentItem["status"]) => void;
}) {
  const late = item.daysUntil < 0;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400 sm:w-20">
        {kindLabel[item.kind]}
      </span>
      <span className="basis-full text-sm text-slate-900 sm:min-w-0 sm:flex-1 sm:basis-auto">
        {item.title}
      </span>
      <span className={`text-xs ${late ? "font-medium text-rose-600" : "text-slate-500"}`}>
        {formatDate(item.dueDate)} · {dueLabel(item.daysUntil)}
      </span>
      {item.task && (
        <button
          onClick={() => onTaskDone(item.task!)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Mark done
        </button>
      )}
      {item.document && (
        <select
          value={item.document.status}
          onChange={(e) =>
            onDocumentStatus(item.document!, e.target.value as DocumentItem["status"])
          }
          aria-label={`Status of ${item.title}`}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
        >
          <option value="needed">Needed</option>
          <option value="requested">Requested</option>
          <option value="received">Received</option>
        </select>
      )}
    </li>
  );
}

export default function FollowUpsView() {
  const [data, setData] = useState<Loaded | null>(null);
  const [windowDays, setWindowDays] = useState(7);

  useEffect(() => {
    async function load() {
      setData({
        transactions: await db.listTransactions(),
        people: await db.listPeople(),
        tasks: await db.listTasks(),
        documents: await db.listDocuments(),
        drafts: await db.listDrafts(),
      });
    }
    load();
  }, []);

  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  const deals = findFollowUps(data.transactions, data.tasks, data.documents, windowDays);
  const allItems = deals.flatMap((d) => d.items);
  const overdue = allItems.filter((i) => i.daysUntil < 0).length;

  async function markTaskDone(task: Task) {
    const done: Task = { ...task, status: "done" };
    await db.saveTask(done);
    setData((d) => d && { ...d, tasks: d.tasks.map((x) => (x.id === done.id ? done : x)) });
  }

  async function setDocumentStatus(doc: DocumentItem, status: DocumentItem["status"]) {
    const updated = { ...doc, status };
    await db.saveDocument(updated);
    setData((d) => d && { ...d, documents: d.documents.map((x) => (x.id === doc.id ? updated : x)) });
  }

  async function draftFollowUp(deal: Transaction, items: FollowUpItem[], recipient: Person) {
    const client = data?.people.find((p) => p.id === deal.clientId);
    const agent = data?.people.find((p) => p.id === deal.agentId);
    if (!client || !agent) return;
    const draft = await createDraft(
      deal.id,
      recipient,
      "follow-up",
      buildFollowUpEmail(
        recipient,
        deal,
        client,
        agent,
        items,
        buildSignature(await db.getSettings()),
        (await db.getTemplates()).emails,
      ),
    );
    setData((d) => d && { ...d, drafts: [...d.drafts, draft] });
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="text-sm text-slate-600">
          <span className={overdue ? "font-medium text-rose-600" : ""}>{overdue} overdue</span>
          {" · "}
          {allItems.length - overdue} coming up
        </div>
        <select
          value={windowDays}
          onChange={(e) => setWindowDays(Number(e.target.value))}
          aria-label="Look ahead"
          className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          <option value={3}>Next 3 days</option>
          <option value={7}>Next 7 days</option>
          <option value={14}>Next 14 days</option>
          <option value={30}>Next 30 days</option>
        </select>
      </div>

      {deals.length === 0 ? (
        <EmptyState
          title="You're all caught up"
          description="Nothing is overdue or coming due in this time window."
        />
      ) : (
        <div className="space-y-6">
          {deals.map(({ transaction: deal, items }) => {
            const client = data.people.find((p) => p.id === deal.clientId);
            const agent = data.people.find((p) => p.id === deal.agentId);
            const waiting = data.drafts.filter(
              (d) => d.transactionId === deal.id && d.status !== "sent",
            ).length;
            return (
              <section
                key={deal.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-4">
                  <div className="basis-full sm:min-w-0 sm:flex-1 sm:basis-auto">
                    <Link
                      href={`/transactions/${deal.id}`}
                      className="font-medium text-slate-900 hover:text-indigo-700"
                    >
                      {deal.propertyAddress}
                    </Link>
                    <p className="text-sm text-slate-500">{client?.name}</p>
                  </div>
                  {waiting > 0 && (
                    <Link
                      href={`/transactions/${deal.id}#emails`}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      {waiting} draft{waiting === 1 ? "" : "s"} waiting →
                    </Link>
                  )}
                  {[client, agent].map(
                    (person) =>
                      person && (
                        <button
                          key={person.id}
                          onClick={() => draftFollowUp(deal, items, person)}
                          disabled={person.role === "client" && !clientHasItems(items)}
                          title={
                            person.role === "client" && !clientHasItems(items)
                              ? "Nothing here to ask the client for"
                              : undefined
                          }
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
                        >
                          Draft email to {person.role}
                        </button>
                      ),
                  )}
                </div>
                <ul className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onTaskDone={markTaskDone}
                      onDocumentStatus={setDocumentStatus}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <p className="mt-6 text-xs text-slate-500">
        Only items with a due date appear here. Tasks without one stay on the deal&apos;s checklist.
      </p>
    </div>
  );
}
