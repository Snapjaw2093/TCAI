import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";

export default function Page() {
  return (
    <>
      <PageHeader title="New transaction" description="Capture the client, agent, and property details." />
      <EmptyState title="Form coming in Stage 3" description="This is where you'll start a new deal." />
    </>
  );
}
