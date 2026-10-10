import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { DocumentItem, Task, Transaction } from "@/lib/types";

// Works out what needs attention. Nothing here is saved: the list is
// recalculated from the deals, tasks and documents every time, so it can
// never get out of date with them.

export type FollowUpItem = {
  id: string;
  kind: "task" | "document" | "closing";
  transactionId: string;
  title: string;
  dueDate: string;
  daysUntil: number; // negative = overdue
  task?: Task;
  document?: DocumentItem;
};

export type DealFollowUps = {
  transaction: Transaction;
  items: FollowUpItem[];
};

export function findFollowUps(
  transactions: Transaction[],
  tasks: Task[],
  documents: DocumentItem[],
  windowDays: number,
  today: Date = new Date(),
): DealFollowUps[] {
  const cutoff = format(addDays(today, windowDays), "yyyy-MM-dd");
  const daysUntil = (date: string) => differenceInCalendarDays(parseISO(date), today);

  const deals: DealFollowUps[] = [];
  for (const transaction of transactions) {
    if (transaction.archived) continue;
    if (transaction.status !== "active" && transaction.status !== "pending") continue;
    const items: FollowUpItem[] = [];

    for (const task of tasks) {
      if (task.transactionId !== transaction.id) continue;
      if (task.status !== "open" || !task.dueDate || task.dueDate > cutoff) continue;
      items.push({
        id: task.id,
        kind: "task",
        transactionId: transaction.id,
        title: task.title,
        dueDate: task.dueDate,
        daysUntil: daysUntil(task.dueDate),
        task,
      });
    }

    for (const document of documents) {
      if (document.transactionId !== transaction.id) continue;
      if (document.status === "received" || !document.dueDate || document.dueDate > cutoff) continue;
      items.push({
        id: document.id,
        kind: "document",
        transactionId: transaction.id,
        title: document.name,
        dueDate: document.dueDate,
        daysUntil: daysUntil(document.dueDate),
        document,
      });
    }

    if (transaction.closingDate && transaction.closingDate <= cutoff) {
      items.push({
        id: `${transaction.id}-closing`,
        kind: "closing",
        transactionId: transaction.id,
        title: "Closing date",
        dueDate: transaction.closingDate,
        daysUntil: daysUntil(transaction.closingDate),
      });
    }

    if (items.length === 0) continue;
    items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    deals.push({ transaction, items });
  }

  // Deals with the most urgent item first.
  return deals.sort((a, b) => a.items[0].dueDate.localeCompare(b.items[0].dueDate));
}
