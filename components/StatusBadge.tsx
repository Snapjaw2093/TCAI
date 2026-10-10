import type { TransactionStatus } from "@/lib/types";

const styles: Record<TransactionStatus, string> = {
  active: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  closed: "bg-slate-100 text-slate-600",
  cancelled: "bg-rose-50 text-rose-700",
};

export default function StatusBadge({ status }: { status: TransactionStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${styles[status]}`}
    >
      {status}
    </span>
  );
}
