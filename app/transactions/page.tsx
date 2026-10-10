import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";

export default function Page() {
  return (
    <>
      <PageHeader title="Transactions" description="Every deal you're coordinating." />
      <EmptyState title="No transactions yet" description="Create your first transaction to get started." />
    </>
  );
}
