"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DraftList from "@/components/DraftList";
import EmptyState from "@/components/EmptyState";
import { ErrorPanel, Loading } from "@/components/LoadState";
import OnboardingSteps from "@/components/OnboardingSteps";
import ProgressBar from "@/components/ProgressBar";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";
import { db } from "@/lib/data";
import { applyTemplate } from "@/lib/data/checklist";
import { createWelcomeDrafts, makeDraftActions } from "@/lib/data/drafts";
import { formatDate, isOverdue } from "@/lib/format";
import { needsOnboarding, onboardingFor, type OnboardingStatus } from "@/lib/onboarding";
import { useLoad } from "@/lib/useLoad";
import type { Task } from "@/lib/types";

const primary = "rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50";
const secondary = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

export default function OnboardingView() {
  const toast = useToast();
  const [focus, setFocus] = useState("");
  // Which cards have their welcome drafts open. Unset = open only for the focused deal.
  const [openDrafts, setOpenDrafts] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState("");

  const loader = useCallback(async () => {
    const [transactions, people, tasks, documents, drafts] = await Promise.all([
      db.listTransactions(),
      db.listPeople(),
      db.listTasks(),
      db.listDocuments(),
      db.listDrafts(),
    ]);
    // /onboarding#deal-abc highlights that deal (used right after creating one).
    const hash = window.location.hash;
    setFocus(hash.startsWith("#deal-") ? hash.slice("#deal-".length) : "");
    return { transactions, people, tasks, documents, drafts };
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

  // Scroll to the focused deal once it is on screen.
  useEffect(() => {
    if (focus && data) document.getElementById(`deal-${focus}`)?.scrollIntoView({ block: "start" });
  }, [focus, data]);

  if (error && !data) return <ErrorPanel message={error} onRetry={reload} />;
  if (loading || !data) return <Loading label="Loading onboarding…" />;

  const { transactions, people, tasks, documents, drafts } = data;
  const statuses = transactions
    .filter((t) => !t.archived && (t.status === "active" || t.status === "pending"))
    .map((t) => onboardingFor(t, { people, tasks, documents, drafts }))
    .sort((a, b) => a.transaction.createdAt.localeCompare(b.transaction.createdAt));
  const inProgress = statuses.filter(needsOnboarding);
  const finished = statuses.filter((s) => !needsOnboarding(s));

  const fail = (what: string, e: unknown) =>
    toast(`Couldn't ${what}: ${e instanceof Error ? e.message : "unknown error"}`, "error");

  async function completeTask(task: Task) {
    try {
      const saved = await db.saveTask({ ...task, status: "done" });
      update((d) => ({ ...d, tasks: d.tasks.map((x) => (x.id === saved.id ? saved : x)) }));
    } catch (e) {
      fail("update that task", e);
    }
  }

  async function generateChecklist(s: OnboardingStatus) {
    setBusy(`list-${s.transaction.id}`);
    try {
      const made = await applyTemplate(s.transaction);
      update((d) => ({ ...d, tasks: [...d.tasks, ...made.tasks], documents: [...d.documents, ...made.documents] }));
      toast("Checklist generated from your template.");
    } catch (e) {
      fail("generate the checklist", e);
    }
    setBusy("");
  }

  async function generateWelcome(s: OnboardingStatus) {
    setBusy(`mail-${s.transaction.id}`);
    try {
      const made = await createWelcomeDrafts(s.transaction.id, s.transaction.clientId, s.transaction.agentId);
      update((d) => ({ ...d, drafts: [...d.drafts, ...made] }));
      setOpenDrafts((o) => ({ ...o, [s.transaction.id]: true }));
      toast("Welcome email drafts created. Review and edit them below.");
    } catch (e) {
      fail("create the welcome emails", e);
    }
    setBusy("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
        <p className="max-w-2xl text-sm text-slate-600">
          Onboarding has three steps: enter the deal details, work through the checklist, and send the welcome
          emails. Deals that still need something show up here.
        </p>
        <Link href="/transactions/new" className={primary}>
          Start a new onboarding
        </Link>
      </div>

      {inProgress.length === 0 ? (
        <EmptyState
          title="Nothing to onboard right now"
          description={
            statuses.length === 0
              ? "Start a new onboarding to enter a deal and get its checklist and welcome emails."
              : "Every active deal is fully set up."
          }
        />
      ) : (
        <div className="space-y-6">
          {inProgress.map((s) => {
            const t = s.transaction;
            const open = s.tasks.filter((x) => x.status === "open").sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
            const unsent = s.welcomeDrafts.filter((d) => d.status !== "sent");
            const showDrafts = openDrafts[t.id] ?? t.id === focus;
            return (
              <section
                key={t.id}
                id={`deal-${t.id}`}
                className={`scroll-mt-6 rounded-xl border bg-white ${t.id === focus ? "border-indigo-400 ring-2 ring-indigo-100" : "border-slate-200"}`}
              >
                <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <Link href={`/transactions/${t.id}`} className="font-medium text-slate-900 hover:text-indigo-700">
                      {t.propertyAddress}
                    </Link>
                    <p className="text-sm text-slate-500">
                      {s.client?.name ?? "Unknown client"} · {t.type === "buyer" ? "Buyer" : "Seller"} side · Agent: {s.agent?.name ?? "Unknown"}
                    </p>
                  </div>
                  <StatusBadge status={t.status} />
                  <Link href={`/transactions/${t.id}/edit`} className={secondary}>
                    Edit details
                  </Link>
                </div>

                <div className="grid gap-6 p-5 md:grid-cols-2">
                  <div className="space-y-5">
                    <OnboardingSteps status={s} />
                    {s.checklistReady && <ProgressBar label="Checklist" done={s.tasksDone} total={s.tasks.length} />}
                  </div>

                  <div className="space-y-5">
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Next tasks</p>
                      {!s.checklistReady ? (
                        <button onClick={() => generateChecklist(s)} disabled={busy === `list-${t.id}`} className={primary}>
                          Generate checklist
                        </button>
                      ) : open.length === 0 ? (
                        <p className="text-sm text-emerald-700">Every task is done.</p>
                      ) : (
                        <ul className="space-y-2">
                          {open.slice(0, 5).map((task) => (
                            <li key={task.id} className="flex items-start gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={false}
                                onChange={() => completeTask(task)}
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
                      {s.checklistReady && (
                        <Link href={`/transactions/${t.id}#checklist`} className="mt-2 inline-block text-sm text-indigo-600 hover:underline">
                          Open the full checklist →
                        </Link>
                      )}
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Welcome emails</p>
                      <div className="flex flex-wrap gap-2">
                        {s.welcomeDrafts.length === 0 && (
                          <button onClick={() => generateWelcome(s)} disabled={busy === `mail-${t.id}`} className={primary}>
                            Generate welcome emails
                          </button>
                        )}
                        {unsent.length > 0 && (
                          <button onClick={() => setOpenDrafts((o) => ({ ...o, [t.id]: !showDrafts }))} className={secondary}>
                            {showDrafts ? "Hide" : "Review"} {unsent.length} draft{unsent.length === 1 ? "" : "s"}
                          </button>
                        )}
                        {s.welcome === "sent" && <span className="text-sm text-emerald-700">Sent</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {showDrafts && s.welcomeDrafts.length > 0 && (
                  <div className="border-t border-slate-200 bg-slate-50 p-5">
                    <DraftList drafts={s.welcomeDrafts} people={people} actions={actions} />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {finished.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-slate-700">
            Fully onboarded ({finished.length})
          </summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {finished.map((s) => (
              <li key={s.transaction.id}>
                <Link href={`/transactions/${s.transaction.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-slate-50">
                  <span className="text-slate-900">{s.transaction.propertyAddress}</span>
                  <span className="text-slate-500">{s.client?.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
