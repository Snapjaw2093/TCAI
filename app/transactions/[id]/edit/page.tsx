import { Suspense } from "react";
import EditTransaction from "@/components/EditTransaction";
import PageHeader from "@/components/PageHeader";

// Reading the URL's [id] has to happen inside <Suspense>, same as the detail page.
async function Edit({ params }: { params: PageProps<"/transactions/[id]/edit">["params"] }) {
  const { id } = await params;
  return <EditTransaction id={id} />;
}

export default function Page(props: PageProps<"/transactions/[id]/edit">) {
  return (
    <>
      <PageHeader
        title="Edit transaction"
        description="Update the details. Checklist deadlines follow any date changes."
      />
      <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
        <Edit params={props.params} />
      </Suspense>
    </>
  );
}
