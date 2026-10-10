import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";

export default function Page() {
  return (
    <>
      <PageHeader title="Transaction" description="Overview, checklist, documents, and emails." />
      <EmptyState title="Detail page coming in Stage 3" description="Each deal will have its own page with tabs." />
    </>
  );
}
