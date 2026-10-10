import PageHeader from "@/components/PageHeader";
import TransactionForm from "@/components/TransactionForm";

export default function Page() {
  return (
    <>
      <PageHeader
        title="New transaction"
        description="Step 1 of onboarding: enter the deal details. We generate the checklist and welcome emails for you."
      />
      <TransactionForm />
    </>
  );
}
