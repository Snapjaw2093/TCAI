"use client";

import Link from "next/link";
import { useCallback } from "react";
import { ErrorPanel, Loading } from "@/components/LoadState";
import { db } from "@/lib/data";
import { findFollowUps } from "@/lib/followups";
import { dueLabel, formatDate, relativeDays } from "@/lib/format";
import { needsOnboarding, onboardingFor } from "@/lib/onboarding";
import { useLoad } from "@/lib/useLoad";

function Stat({
  label,
  value,
  note,
  href,
  alert,
}: {
  label: string;
  value: number;
  note?: string;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link href={href} className="rounded-xl border border-slate-200 bg-white p-5 hover:border-indigo-300">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${alert && value > 0 ? "text-rose-600" : "text-slate-900"}`}>{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </Link>
  );
}

function Panel({
  title,
  link,
  children,
}: {
  title: string;
  link?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-medium text-slate-900">{title}</h2>
        {link && (
          <Link href={link.href} className="text-xs text-indigo-600 hover:underline">
            {link.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

const Empty = ({ text }: { text: string }) => <p className="px-5 py-6 text-sm text-slate-500">{text}</p>;

const rowClass = "flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50";

export default function Dashboard() {
  const loader = useCallback(async () => {
    const [transactions, people, tasks, documents, drafts, settings] = await Promise.all([
      db.listTransactions(),
      db.listPeople(),
      db.listTasks(),
      db.listDocuments(),
      db.listDrafts(),
      db.getSettings(),
    ]);
    return { transactions, people, tasks, documents, drafts, settings };
  }, []);
  const { data, error, loading, reload } = useLoad(loader);

  if (error && !data) return <ErrorPanel message={error} onRetry={reload} />;
  if (loading || !data) return <Loading label="Loading your dashboard…" />;

  const { transactions, people, tasks, documents, drafts, settings } = data;
  const live = transactions.filter((t) => !t.archived);

  if (live.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
        <h2 className="text-lg font-medium text-slate-900">Welcome to TC Assistant</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Start your first transaction and we&apos;ll build the checklist, track documents, and draft the emails
          for you.
        </p>
        <Link
          href="/transactions/new"
          className="mt-5 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          New transaction
        </Link>
      </div>
    );
  }

  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "";
  const today = new Date().toISOString().slice(0, 10);
  const days = settings.followUpDays;

  const active = live.filter((t) => t.status === "active" || t.status === "pending");
  const onboarding = active
    .map((t) => onboardingFor(t, { people, tasks, documents, drafts }))
    .filter(needsOnboarding);

  const items = findFollowUps(live, tasks, documents, days)
    .flatMap((d) => d.items.map((item) => ({ item, deal: d.transaction })))
    .sort((a, b) => a.item.dueDate.localeCompare(b.item.dueDate));
  const overdue = items.filter((x) => x.item.daysUntil < 0).length;
  const upcoming = items.length - overdue;

  const toReview = drafts.filter((d) => d.status !== "sent");
  const closings = active
    .filter((t) => t.closingDate && t.closingDate >= today)
    .sort((a, b) => a.closingDate!.localeCompare(b.closingDate!))
    .slice(0, 4);

  // The first thing still to do for a deal in onboarding.
  const onboardingNeed = (s: (typeof onboarding)[number]) => {
    const important = s.missing.filter((m) => m.important);
    if (important.length) return `Missing ${important.map((m) => m.label.toLowerCase()).join(" and ")}`;
    if (!s.checklistReady) return "Checklist not generated";
    if (s.welcome === "none") return "Welcome email not drafted";
    return "Welcome email not sent yet";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Link href="/transactions/new" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          New transaction
        </Link>
        <Link href="/follow-ups#compose" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Draft an email
        </Link>
        <Link href="/follow-ups#ai" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Draft with AI
        </Link>
        <Link href="/follow-ups" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Review follow-ups
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active transactions" value={active.length} href="/transactions" />
        <Stat
          label="Needs onboarding"
          value={onboarding.length}
          note={onboarding.length ? "Finish setting these up" : "All set up"}
          href="/onboarding"
        />
        <Stat
          label="Outstanding follow-ups"
          value={items.length}
          note={overdue ? `${overdue} overdue` : "None overdue"}
          href="/follow-ups"
          alert={overdue > 0}
        />
        <Stat label="Upcoming deadlines" value={upcoming} note={`Next ${days} days`} href="/follow-ups" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Needs attention" link={{ href: "/follow-ups", label: "See all →" }}>
          {items.length === 0 ? (
            <Empty text={`You're all caught up for the next ${days} days.`} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.slice(0, 6).map(({ item, deal }) => (
                <li key={item.id}>
                  <Link href={`/transactions/${deal.id}`} className={rowClass}>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-900">{item.title}</p>
                      <p className="truncate text-xs text-slate-500">{deal.propertyAddress}</p>
                    </div>
                    <span className={`shrink-0 text-xs ${item.daysUntil < 0 ? "font-medium text-rose-600" : "text-slate-500"}`}>
                      {dueLabel(item.daysUntil)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Needs onboarding" link={{ href: "/onboarding", label: "Open onboarding →" }}>
          {onboarding.length === 0 ? (
            <Empty text="Every active deal is fully set up." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {onboarding.slice(0, 5).map((s) => (
                <li key={s.transaction.id}>
                  <Link href={`/onboarding#deal-${s.transaction.id}`} className={rowClass}>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-900">{s.transaction.propertyAddress}</p>
                      <p className="truncate text-xs text-slate-500">{nameOf(s.transaction.clientId)}</p>
                    </div>
                    <span className="shrink-0 text-xs text-amber-700">{onboardingNeed(s)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Upcoming closings" link={{ href: "/transactions", label: "All deals →" }}>
          {closings.length === 0 ? (
            <Empty text="No upcoming closing dates." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {closings.map((t) => (
                <li key={t.id}>
                  <Link href={`/transactions/${t.id}`} className={rowClass}>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-900">{t.propertyAddress}</p>
                      <p className="truncate text-xs text-slate-500">{nameOf(t.clientId)}</p>
                    </div>
                    <span className="shrink-0 text-right text-xs text-slate-500">
                      {formatDate(t.closingDate)}
                      <br />
                      {relativeDays(t.closingDate)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Drafts to review" link={{ href: "/follow-ups#drafts", label: "All drafts →" }}>
          {toReview.length === 0 ? (
            <Empty text="No unsent drafts." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {toReview.slice(0, 5).map((d) => (
                <li key={d.id}>
                  <Link href="/follow-ups#drafts" className={rowClass}>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-900">{d.subject}</p>
                      <p className="truncate text-xs text-slate-500">To {nameOf(d.recipientId) || d.recipientEmail || "someone"}</p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">{d.status === "approved" ? "Approved · not sent" : "Draft · not sent"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
