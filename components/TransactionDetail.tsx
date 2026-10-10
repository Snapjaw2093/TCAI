"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import ChecklistPanel from "@/components/ChecklistPanel";
import DocumentList from "@/components/DocumentList";
import EmailsPanel from "@/components/EmailsPanel";
import FilesPanel from "@/components/FilesPanel";
import { ErrorPanel, Loading } from "@/components/LoadState";
import OnboardingSteps from "@/components/OnboardingSteps";
import ProgressBar from "@/components/ProgressBar";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";
import { db } from "@/lib/data";
import { applyTemplate } from "@/lib/data/checklist";
import { makeDraftActions } from "@/lib/data/drafts";
import { formatDate, formatPrice, isOverdue, relativeDays } from "@/lib/format";
import { needsOnboarding, onboardingFor } from "@/lib/onboarding";
import { useLoad } from "@/lib/useLoad";
import type {
  DocumentFile,
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
  tasks: Task[];
  documents: DocumentItem[];
  files: DocumentFile[];
  drafts: EmailDraft[];
  categories: string[];
};

const tabs = ["Overview", "Checklist", "Documents", "Emails"] as const;
type Tab = (typeof tabs)[number];

const tabFromHash = (): Tab | undefined =>
  typeof window === "undefined"
    ? undefined
    : tabs.find((name) => name.toLowerCase() === window.location.hash.slice(1));

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      {children}
    </div>
  );
}

function PersonCard({ title, person }: { title: string; person?: Person }) {
  return (
    <Card title={title}>
      {person ? (
        <>
          <p className="font-medium text-slate-900">{person.name}</p>
          <p className="text-sm text-slate-600">{person.email}</p>
          <p className="text-sm text-slate-600">{person.phone || <span className="text-amber-700">No phone yet</span>}</p>
        </>
      ) : (
        <p className="text-sm text-slate-500">Not found</p>
      )}
    </Card>
  );
}

function DateCard({ title, date }: { title: string; date: string | null }) {
  return (
    <Card title={title}>
      {date ? (
        <>
          <p className="font-medium text-slate-900">{formatDate(date)}</p>
          <p className="text-sm text-slate-600">{relativeDays(date)}</p>
        </>
      ) : (
        <p className="text-sm text-amber-700">Not set yet</p>
      )}
    </Card>
  );
}

export default function TransactionDetail({ id }: { id: string }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("Overview");

  const loader = useCallback(async (): Promise<Loaded | null> => {
    const transaction = await db.getTransaction(id);
    // Links like /transactions/abc#emails open straight to that tab.
    const wanted = tabFromHash();
    if (wanted) setTab(wanted);
    if (!transaction) return null;
    const [people, tasks, documents, files, drafts, settings] = await Promise.all([
      db.listPeople(),
      db.listTasks(id),
      db.listDocuments(id),
      db.listFiles(id),
      db.listDrafts(id),
      db.getSettings(),
    ]);
    return { transaction, people, tasks, documents, files, drafts, categories: settings.taskCategories };
  }, [id]);
  const { data, error, loading, reload, update } = useLoad(loader);

  const fail = (what: string, e: unknown) =>
    toast(`Couldn't ${what}: ${e instanceof Error ? e.message : "unknown error"}`, "error");

  async function updateTask(task: Task) {
    try {
      await db.saveTask(task);
      update((d) => ({ ...d, tasks: d.tasks.map((x) => (x.id === task.id ? task : x)) }));
    } catch (e) {
      fail("update that task", e);
    }
  }

  async function updateDocument(doc: DocumentItem) {
    try {
      await db.saveDocument(doc);
      update((d) => ({ ...d, documents: d.documents.map((x) => (x.id === doc.id ? doc : x)) }));
    } catch (e) {
      fail("update that document", e);
    }
  }

  async function saveTransaction(change: Partial<Transaction>, message: string) {
    if (!data) return;
    try {
      const saved = await db.saveTransaction({ ...data.transaction, ...change });
      update((d) => ({ ...d, transaction: saved }));
      toast(message);
    } catch (e) {
      fail("save that change", e);
    }
  }

  async function generateChecklist() {
    if (!data) return;
    try {
      const { tasks, documents } = await applyTemplate(data.transaction);
      update((d) => ({ ...d, tasks, documents }));
      toast("Checklist generated from your template.");
    } catch (e) {
      fail("generate the checklist", e);
    }
  }

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
        remove: (draftId) => update((d) => ({ ...d, drafts: d.drafts.filter((x) => x.id !== draftId) })),
      }),
    [update],
  );

  if (error && !data) return <ErrorPanel message={error} onRetry={reload} />;
  if (loading) return <Loading label="Loading transaction…" />;

  if (!data) {
    return (
      <div>
        <p className="text-slate-700">We couldn&apos;t find that transaction.</p>
        <Link href="/transactions" className="text-sm text-indigo-600 hover:underline">
          Back to transactions
        </Link>
      </div>
    );
  }

  const { transaction: t, people, tasks, documents, files, drafts, categories } = data;
  const client = people.find((p) => p.id === t.clientId);
  const agent = people.find((p) => p.id === t.agentId);
  const onboarding = onboardingFor(t, { people, tasks, documents, drafts });
  const tasksDone = tasks.filter((x) => x.status !== "open").length;
  const requiredDocs = documents.filter((x) => x.required);
  const requiredReceived = requiredDocs.filter((x) => x.status === "received").length;
  const outstanding = tasks
    .filter((x) => x.status === "open")
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
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
        {t.archived && (
          <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-700">Archived</span>
        )}
        <span className="text-sm text-slate-500">{t.type === "buyer" ? "Buyer side" : "Seller side"}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link
            href={`/transactions/${t.id}/edit`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Edit
          </Link>
          <select
            value={t.status}
            onChange={(e) =>
              saveTransaction({ status: e.target.value as TransactionStatus }, `Status changed to ${e.target.value}.`)
            }
            aria-label="Change status"
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
          >
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="closed">Closed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            onClick={() =>
              saveTransaction(
                { archived: !t.archived },
                t.archived ? "Restored from the archive." : "Archived. Find it under “Show archived” on Transactions.",
              )
            }
            className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t.archived ? "Restore" : "Archive"}
          </button>
        </div>
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
            {counts[name] !== null && <span className="ml-1.5 text-xs text-slate-400">{counts[name]}</span>}
          </button>
        ))}
      </div>

      {tab === "Overview" ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Onboarding">
              <OnboardingSteps status={onboarding} />
              {needsOnboarding(onboarding) && (
                <Link
                  href={`/onboarding#deal-${t.id}`}
                  className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline"
                >
                  Open in Onboarding →
                </Link>
              )}
            </Card>
            <Card title={`Outstanding tasks${outstanding.length ? ` (${outstanding.length})` : ""}`}>
              {tasks.length === 0 ? (
                <p className="text-sm text-slate-500">No checklist yet. Open the Checklist tab to generate one.</p>
              ) : outstanding.length === 0 ? (
                <p className="text-sm text-emerald-700">Every task is done.</p>
              ) : (
                <ul className="space-y-2">
                  {outstanding.slice(0, 6).map((task) => (
                    <li key={task.id} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => updateTask({ ...task, status: "done" })}
                        aria-label={`Mark "${task.title}" done`}
                        className="mt-0.5 h-4 w-4 accent-indigo-600"
                      />
                      <span className="min-w-0 flex-1 text-slate-900">{task.title}</span>
                      <span className={`shrink-0 text-xs ${isOverdue(task.dueDate) ? "font-medium text-rose-600" : "text-slate-500"}`}>
                        {task.dueDate ? formatDate(task.dueDate) : "No date"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {outstanding.length > 6 && (
                <button onClick={() => setTab("Checklist")} className="mt-3 text-sm font-medium text-indigo-600 hover:underline">
                  See all {outstanding.length} →
                </button>
              )}
            </Card>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ProgressBar label="Tasks complete" done={tasksDone} total={tasks.length} />
            <ProgressBar label="Required documents received" done={requiredReceived} total={requiredDocs.length} />
            <PersonCard title="Client" person={client} />
            <PersonCard title="Agent" person={agent} />
            <DateCard title="Contract date" date={t.contractDate} />
            <DateCard title="Closing date" date={t.closingDate} />
          </div>
          <Card title="Price & notes">
            <p className="font-medium text-slate-900">{formatPrice(t.price)}</p>
            {t.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{t.notes}</p>}
          </Card>
        </div>
      ) : tab === "Documents" ? (
        <>
          {documents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <p className="font-medium text-slate-900">No checklist yet</p>
              <p className="mt-1 text-sm text-slate-500">Build tasks and required documents from the {t.type} template.</p>
              <button
                onClick={generateChecklist}
                className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Generate checklist
              </button>
            </div>
          ) : (
            <DocumentList documents={documents} files={files} onChange={updateDocument} />
          )}
          <FilesPanel
            transactionId={t.id}
            documents={documents}
            files={files}
            onUploaded={(file) => update((d) => ({ ...d, files: [file, ...d.files] }))}
            onRemoved={(fileId) => update((d) => ({ ...d, files: d.files.filter((x) => x.id !== fileId) }))}
            onDocumentReceived={(doc) => update((d) => ({ ...d, documents: d.documents.map((x) => (x.id === doc.id ? doc : x)) }))}
          />
        </>
      ) : tab === "Checklist" ? (
        tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <p className="font-medium text-slate-900">No checklist yet</p>
            <p className="mt-1 text-sm text-slate-500">Build tasks and required documents from the {t.type} template.</p>
            <button
              onClick={generateChecklist}
              className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Generate checklist
            </button>
          </div>
        ) : (
          <ChecklistPanel tasks={tasks} categories={categories} onChange={updateTask} />
        )
      ) : (
        <EmailsPanel
          transactionId={t.id}
          drafts={drafts}
          client={client}
          agent={agent}
          people={people}
          actions={actions}
          onCreated={(draft) => update((d) => ({ ...d, drafts: [...d.drafts, draft] }))}
        />
      )}
    </div>
  );
}
