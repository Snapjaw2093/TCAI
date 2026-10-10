import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";

export default function Page() {
  return (
    <>
      <PageHeader title="Dashboard" description="Your active deals and what needs attention." />
      <EmptyState title="Nothing here yet" description="Active transactions, upcoming deadlines, and drafts to review will show up here." />
    </>
  );
}
