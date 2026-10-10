import { differenceInCalendarDays, format, parseISO } from "date-fns";

export function formatDate(date: string | null): string {
  return date ? format(parseISO(date), "MMM d, yyyy") : "Not set";
}

export function formatPrice(price: number | null): string {
  return price == null
    ? "Not set"
    : price.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// "in 6 days", "today", "3 days ago"
export function relativeDays(date: string | null): string {
  if (!date) return "";
  const n = differenceInCalendarDays(parseISO(date), new Date());
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

// True when a due date (YYYY-MM-DD) is before today. Dates are plain text,
// so comparing them as text works.
export function isOverdue(date: string | null): boolean {
  return !!date && date < format(new Date(), "yyyy-MM-dd");
}

// "3 days overdue", "due today", "due in 4 days"
export function dueLabel(daysUntil: number): string {
  if (daysUntil < 0) return `${-daysUntil} day${daysUntil === -1 ? "" : "s"} overdue`;
  if (daysUntil === 0) return "due today";
  return `due in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`;
}
