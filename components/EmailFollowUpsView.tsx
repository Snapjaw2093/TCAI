"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import DraftList from "@/components/DraftList";
import EmptyState from "@/components/EmptyState";
import { ErrorPanel, Loading } from "@/components/LoadState";
import { useToast } from "@/components/ToastProvider";
import { db } from "@/lib/data";
import { generateDraft, makeDraftActions, type DraftPurpose } from "@/lib/data/drafts";
import { findFollowUps, type FollowUpItem } from "@/lib/followups";
import { dueLabel, formatDate } from "@/lib/format";
import { useLoad } from "@/lib/useLoad";
import type { DocumentItem, EmailDraft, Person, Task, Transaction } from "@/lib/types";

const tabs = ["Follow-ups", "Drafts", "Sent"] as const;
type Tab = (typeof tabs)[number];

const kindLabel = { task: "Task", document: "Document", closing: "Closing" };
const selectClass = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const primary = "rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40";

// Client emails only cover documents and the closing date, not internal tasks.
const clientHasItems = (items: FollowUpItem[]) => items.some((i) => i.kind !== "task");

function ItemRow({
  item,
  category,
  onTaskDone,
  onDocumentStatus,
}: {
  item: FollowUpItem;
  category?: string;
  onTaskDone: (task: Task) => void;
  onDocumentStatus: (doc: DocumentItem, status: DocumentItem["status"]) => void;
}) {
  const late = item.daysUntil < 0;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400 sm:w-20">{kindLabel[item.kind]}</span>
      <span className="basis-full text-sm text-slate-900 sm:min-w-0 sm:flex-1 sm:basis-auto">
        {item.title}
        {category && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{category}</span>}
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
          onChange={(e) => onDocumentStatus(item.document!, e.target.value as DocumentItem["status"])}
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

// ---- Compose: pick a deal and a recipient, then generate a draft ----

function Composer({
  deals,
  people,
  itemCounts,
  onCreated,
  onClose,
}: {
  deals: Transaction[];
  people: Person[];
  itemCounts: Record<string, number>;
  onCreated: (draft: EmailDraft) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [dealId, setDealId] = useState(deals[0]?.id ?? "");
  const [who, setWho] = useState<"client" | "agent">("client");
  const [purpose, setPurpose] = useState<DraftPurpose>("follow-up");
  const [busy, setBusy] = useState(false);

  const deal = deals.find((d) => d.id === dealId);
  const recipient = deal && people.find((p) => p.id === (who === "client" ? deal.clientId : deal.agentId));

  async function generate() {
    if (!deal || !recipient) return;
    setBusy(true);
    try {
      onCreated(await generateDraft(deal.id, recipient.id, purpose));
      toast(`Draft created for ${recipient.name}. Review it in Drafts.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't create the draft.", "error");
    }
    setBusy(false);
  }

  if (deals.length === 0) {
    return (
      <div id="compose" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        Create a transaction first, then you can draft emails for it.{" "}
        <button onClick={onClose} className="text-indigo-600 hover:underline">Close</button>
      </div>
    );
  }

  return (
    <div id="compose" className="rounded-xl border border-indigo-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-medium text-slate-900">New email</h2>
        <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-900">Close</button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Transaction</span>
          <select value={dealId} onChange={(e) => setDealId(e.target.value)} className={`${selectClass} w-full`} aria-label="Transaction">
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.propertyAddress} · {people.find((p) => p.id === d.clientId)?.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Recipient</span>
          <select value={who} onChange={(e) => setWho(e.target.value as "client" | "agent")} className={`${selectClass} w-full`} aria-label="Recipient">
            {deal && (
              <>
                <option value="client">Client: {people.find((p) => p.id === deal.clientId)?.name}</option>
                <option value="agent">Agent: {people.find((p) => p.id === deal.agentId)?.name}</option>
              </>
            )}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">What is it about?</span>
          <select value={purpose} onChange={(e) => setPurpose(e.target.value as DraftPurpose)} className={`${selectClass} w-full`} aria-label="Purpose">
            <option value="follow-up">Follow-up on outstanding items</option>
            <option value="welcome">Welcome email</option>
          </select>
        </label>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {purpose === "follow-up"
          ? `${itemCounts[dealId] ?? 0} outstanding item${(itemCounts[dealId] ?? 0) === 1 ? "" : "s"} for this deal will go into the email.`
          : "Uses your welcome email template and the deal's details."}{" "}
        The wording is filled in from your templates (Settings → Templates). You can edit everything before using it.
      </p>
      <button onClick={generate} disabled={busy || !recipient} className={`${primary} mt-4`}>
        {busy ? "Generating…" : "Generate draft"}
      </button>
    </div>
  );
}

export default function EmailFollowUpsView() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("Follow-ups");
  const [composing, setComposing] = useState(false);
  const [windowDays, setWindowDays] = useState(7);
  const [dealFilter, setDealFilter] = useState("all");

  const loader = useCallback(async () => {
    const [transactions, people, tasks, documents, drafts, settings] = await Promise.all([
      db.listTransactions(),
      db.listPeople(),
      db.listTasks(),
      db.listDocuments(),
      db.listDrafts(),
      db.getSettings(),
    ]);
    // Links like /follow-ups#compose or #drafts open that part directly.
    const hash = window.location.hash.slice(1);
    setWindowDays(settings.followUpDays);
    if (hash === "compose") setComposing(true);
    if (hash === "drafts") setTab("Drafts");
    if (hash === "sent") setTab("Sent");
    return { transactions, people, tasks, documents, drafts, settings };
  }, []);
  const { data, error, loading, reload, update } = useLoad(loader);

  const actions = useMemo(
    () =>
      makeDraftActions({
        upsert: (draft, completedTask) =>
          update((d) => ({
            ...d,
            drafts: d.drafts.some((x) => x.id === draft.id)
              ? d.drafts.map((x) => (x.id === draft.id ? draft : x))
              : [...d.drafts, draft],
            tasks: completedTask ? d.tasks.map((x) => (x.id === completedTask.id ? completedTask : x)) : d.tasks,
          })),
        remove: (id) => update((d) => ({ ...d, drafts: d.drafts.filter((x) => x.id !== id) })),
      }),
    [update],
  );

  if (error && !data) return <ErrorPanel message={error} onRetry={reload} />;
  if (loading || !data) return <Loading label="Loading…" />;

  const { transactions, people, tasks, documents, drafts } = data;
  const live = transactions.filter((t) => !t.archived);
  const deals = findFollowUps(live, tasks, documents, windowDays);
  const allItems = deals.flatMap((d) => d.items);
  const overdue = allItems.filter((i) => i.daysUntil < 0).length;
  const itemCounts = Object.fromEntries(deals.map((d) => [d.transaction.id, d.items.length]));
  const categoryOf = (item: FollowUpItem) => item.task?.category;

  const unsent = drafts.filter((d) => d.status !== "sent");
  const sent = drafts.filter((d) => d.status === "sent");
  const byDeal = (list: EmailDraft[]) => (dealFilter === "all" ? list : list.filter((d) => d.transactionId === dealFilter));

  const fail = (what: string, e: unknown) =>
    toast(`Couldn't ${what}: ${e instanceof Error ? e.message : "unknown error"}`, "error");

  async function markTaskDone(task: Task) {
    try {
      const done = await db.saveTask({ ...task, status: "done" });
      update((d) => ({ ...d, tasks: d.tasks.map((x) => (x.id === done.id ? done : x)) }));
      toast("Task marked done.");
    } catch (e) {
      fail("update that task", e);
    }
  }

  async function setDocumentStatus(doc: DocumentItem, status: DocumentItem["status"]) {
    try {
      const saved = await db.saveDocument({ ...doc, status });
      update((d) => ({ ...d, documents: d.documents.map((x) => (x.id === saved.id ? saved : x)) }));
    } catch (e) {
      fail("update that document", e);
    }
  }

  async function draftFollowUp(deal: Transaction, recipient: Person) {
    try {
      const draft = await generateDraft(deal.id, recipient.id, "follow-up");
      update((d) => ({ ...d, drafts: [...d.drafts, draft] }));
      toast(`Follow-up draft created for ${recipient.name}.`);
      setTab("Drafts");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't create the draft.", "error");
    }
  }

  const counts: Record<Tab, number> = { "Follow-ups": allItems.length, Drafts: unsent.length, Sent: sent.length };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 sm:flex-1">
          {tabs.map((name) => (
            <button
              key={name}
              onClick={() => setTab(name)}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${
                tab === name ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              {name}
              <span className="ml-1.5 text-xs text-slate-400">{counts[name]}</span>
            </button>
          ))}
        </div>
        <button onClick={() => setComposing((c) => !c)} className={primary}>
          New email
        </button>
      </div>

      {composing && (
        <Composer
          deals={live}
          people={people}
          itemCounts={itemCounts}
          onClose={() => setComposing(false)}
          onCreated={(draft) => {
            update((d) => ({ ...d, drafts: [...d.drafts, draft] }));
            setTab("Drafts");
            setComposing(false);
          }}
        />
      )}

      {tab === "Follow-ups" && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <div className="text-sm text-slate-600">
              <span className={overdue ? "font-medium text-rose-600" : ""}>{overdue} overdue</span>
              {" · "}
              {allItems.length - overdue} coming up
            </div>
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
              aria-label="Look ahead"
              className={`${selectClass} ml-auto py-1.5`}
            >
              <option value={3}>Next 3 days</option>
              <option value={7}>Next 7 days</option>
              <option value={14}>Next 14 days</option>
              <option value={30}>Next 30 days</option>
            </select>
          </div>

          {deals.length === 0 ? (
            <EmptyState title="You're all caught up" description="Nothing is overdue or coming due in this time window." />
          ) : (
            <div className="space-y-6">
              {deals.map(({ transaction: deal, items }) => {
                const client = people.find((p) => p.id === deal.clientId);
                const agent = people.find((p) => p.id === deal.agentId);
                const waiting = unsent.filter((d) => d.transactionId === deal.id).length;
                return (
                  <section key={deal.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-4">
                      <div className="basis-full sm:min-w-0 sm:flex-1 sm:basis-auto">
                        <Link href={`/transactions/${deal.id}`} className="font-medium text-slate-900 hover:text-indigo-700">
                          {deal.propertyAddress}
                        </Link>
                        <p className="text-sm text-slate-500">{client?.name}</p>
                      </div>
                      {waiting > 0 && (
                        <button onClick={() => { setDealFilter(deal.id); setTab("Drafts"); }} className="text-xs text-indigo-600 hover:underline">
                          {waiting} draft{waiting === 1 ? "" : "s"} waiting →
                        </button>
                      )}
                      {[client, agent].map(
                        (person) =>
                          person && (
                            <button
                              key={person.id}
                              onClick={() => draftFollowUp(deal, person)}
                              disabled={person.role === "client" && !clientHasItems(items)}
                              title={person.role === "client" && !clientHasItems(items) ? "Nothing here to ask the client for" : undefined}
                              className={`${primary} text-xs`}
                            >
                              Draft email to {person.role}
                            </button>
                          ),
                      )}
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {items.map((item) => (
                        <ItemRow key={item.id} item={item} category={categoryOf(item)} onTaskDone={markTaskDone} onDocumentStatus={setDocumentStatus} />
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
      )}

      {(tab === "Drafts" || tab === "Sent") && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <select value={dealFilter} onChange={(e) => setDealFilter(e.target.value)} aria-label="Filter by transaction" className={selectClass}>
              <option value="all">All transactions</option>
              {transactions.map((t) => (
                <option key={t.id} value={t.id}>{t.propertyAddress}</option>
              ))}
            </select>
            <p className="text-sm text-slate-500">
              {tab === "Drafts"
                ? "Written by the app from your templates. Nothing here has been sent."
                : "Messages you told us you sent from your own email app."}
            </p>
          </div>
          <DraftList
            drafts={byDeal(tab === "Drafts" ? unsent : sent)}
            people={people}
            transactions={transactions}
            actions={actions}
            showDeal
            emptyText={tab === "Drafts" ? "No drafts waiting. Use “New email” to write one." : "Nothing marked as sent yet."}
          />
        </div>
      )}
    </div>
  );
}
