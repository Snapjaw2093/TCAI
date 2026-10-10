import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";

export default function Page() {
  return (
    <>
      <PageHeader title="Follow-ups" description="Overdue and upcoming items across all deals." />
      <EmptyState title="Nothing to follow up on" description="Outstanding tasks and documents will be listed here." />
    </>
  );
}
