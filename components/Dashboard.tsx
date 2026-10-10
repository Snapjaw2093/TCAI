"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { db } from "@/lib/data";
import { findFollowUps } from "@/lib/followups";
import { dueLabel, formatDate, relativeDays } from "@/lib/format";
import type { EmailDraft, Person, Transaction } from "@/lib/types";
import type { DealFollowUps } from "@/lib/followups";

type Loaded = {
  transactions: Transaction[];
  people: Person[];
  drafts: EmailDraft[];
  deals: DealFollowUps[];
};

function Stat({
  label,
  value,
  href,
  alert,
}: {
  label: string;
  value: number;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-slate-200 bg-white p-5 hover:border-indigo-300"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-1 text-3xl font-semibold ${
          alert && value > 0 ? "text-rose-600" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </Link>
  );
}

function Card({
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

const Empty = ({ text }: { text: string }) => (
  <p className="px-5 py-6 text-sm text-slate-500">{text}</p>
);

export default function Dashboard() {
  const [data, setData] = useState<Loaded | null>(null);

  useEffect(() => {
    async function load() {
      const [transactions, people, tasks, documents, drafts] = await Promise.all([
        db.listTransactions(),
        db.listPeople(),
        db.listTasks(),
        db.listDocuments(),
        db.listDrafts(),
      ]);
      setData({
        transactions,
        people,
        drafts,
        deals: findFollowUps(transactions, tasks, documents, 7),
      });
    }
    load();
  }, []);

  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  if (data.transactions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
        <h2 className="text-lg font-medium text-slate-900">Welcome to TC Assistant</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Start your first transaction and we&apos;ll build the checklist, track documents, and
          draft the emails for you.
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

  const nameOf = (id: string) => data.people.find((p) => p.id === id)?.name ?? "";
  const today = new Date().toISOString().slice(0, 10);
  const open = data.transactions.filter((t) => t.status === "active" || t.status === "pending");
  const items = data.deals.flatMap((d) =>
    d.items.map((item) => ({ item, deal: d.transaction })),
  );
  items.sort((a, b) => a.item.dueDate.localeCompare(b.item.dueDate));
  const overdue = items.filter((x) => x.item.daysUntil < 0).length;
  const toReview = data.drafts.filter((d) => d.status !== "sent");
  const closings = open
    .filter((t) => t.closingDate && t.closingDate >= today)
    .sort((a, b) => a.closingDate!.localeCompare(b.closingDate!))
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Open deals" value={open.length} href="/transactions" />
        <Stat label="Overdue items" value={overdue} href="/follow-ups" alert />
        <Stat label="Due this week" value={items.length - overdue} href="/follow-ups" />
        <Stat label="Drafts to review" value={toReview.length} href="/follow-ups" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Needs attention" link={{ href: "/follow-ups", label: "See all →" }}>
          {items.length === 0 ? (
            <Empty text="You're all caught up for the next 7 days." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.slice(0, 6).map(({ item, deal }) => (
                <li key={item.id}>
                  <Link
                    href={`/transactions/${deal.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-900">{item.title}</p>
                      <p className="truncate text-xs text-slate-500">{deal.propertyAddress}</p>
                    </div>
                    <span
                      className={`shrink-0 text-xs ${
                        item.daysUntil < 0 ? "font-medium text-rose-600" : "text-slate-500"
                      }`}
                    >
                      {dueLabel(item.daysUntil)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Upcoming closings" link={{ href: "/transactions", label: "All deals →" }}>
          {closings.length === 0 ? (
            <Empty text="No upcoming closing dates." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {closings.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/transactions/${t.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50"
                  >
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
        </Card>

        <Card title="Drafts to review">
          {toReview.length === 0 ? (
            <Empty text="No unsent drafts." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {toReview.slice(0, 6).map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/transactions/${d.transactionId}#emails`}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-900">{d.subject}</p>
                      <p className="truncate text-xs text-slate-500">To {nameOf(d.recipientId)}</p>
                    </div>
                    <span className="shrink-0 text-xs capitalize text-slate-500">{d.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
