import Dashboard from "@/components/Dashboard";
import PageHeader from "@/components/PageHeader";

export default function Page() {
  return (
    <>
      <PageHeader title="Dashboard" description="Your active deals and what needs attention." />
      <Dashboard />
    </>
  );
}
