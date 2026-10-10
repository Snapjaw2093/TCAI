import PageHeader from "@/components/PageHeader";
import TransactionForm from "@/components/TransactionForm";

export default function Page() {
  return (
    <>
      <PageHeader
        title="New transaction"
        description="Capture the client, agent, and property details."
      />
      <TransactionForm />
    </>
  );
}
