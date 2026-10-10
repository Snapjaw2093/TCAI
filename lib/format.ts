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
