import { differenceInCalendarDays, parseISO } from "date-fns";
import type { DocumentItem, Task, Transaction } from "@/lib/types";

// "What should I do next on this deal?" The open task or unreceived document
// with the earliest due date. If nothing has a date, the first open task.
// If everything is done, the closing date (or nothing).

export type NextAction = {
  label: string;
  dueDate: string | null;
  daysUntil: number | null; // negative = overdue
};

export function nextAction(
  transaction: Transaction,
  tasks: Task[],
  documents: DocumentItem[],
  today: Date = new Date(),
): NextAction | null {
  const candidates = [
    ...tasks
      .filter((t) => t.transactionId === transaction.id && t.status === "open")
      .map((t) => ({ label: t.title, dueDate: t.dueDate })),
    ...documents
      .filter((d) => d.transactionId === transaction.id && d.status !== "received" && d.required)
      .map((d) => ({ label: `Get: ${d.name}`, dueDate: d.dueDate })),
  ];

  const dated = candidates
    .filter((c): c is { label: string; dueDate: string } => !!c.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const pick = dated[0] ?? candidates[0];

  if (pick) {
    return {
      label: pick.label,
      dueDate: pick.dueDate,
      daysUntil: pick.dueDate ? differenceInCalendarDays(parseISO(pick.dueDate), today) : null,
    };
  }
  if (transaction.closingDate) {
    return {
      label: "Closing",
      dueDate: transaction.closingDate,
      daysUntil: differenceInCalendarDays(parseISO(transaction.closingDate), today),
    };
  }
  return null;
}
