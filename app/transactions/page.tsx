import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import TransactionList from "@/components/TransactionList";

export default function Page() {
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Transactions" description="Every deal you're coordinating." />
        <Link
          href="/transactions/new"
          className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          New transaction
        </Link>
      </div>
      <TransactionList />
    </>
  );
}
