import { Suspense } from "react";
import TransactionDetail from "@/components/TransactionDetail";

// Reading the URL's [id] has to happen inside <Suspense> so the rest of
// the page can show instantly while it resolves.
async function Detail({ params }: { params: PageProps<"/transactions/[id]">["params"] }) {
  const { id } = await params;
  return <TransactionDetail id={id} />;
}

export default function Page(props: PageProps<"/transactions/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <Detail params={props.params} />
    </Suspense>
  );
}
