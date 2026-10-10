import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";

export default function Page() {
  return (
    <>
      <PageHeader title="Templates" description="Onboarding checklists and email wording." />
      <EmptyState title="Template editor comes later" description="For now, templates live in code." />
    </>
  );
}
