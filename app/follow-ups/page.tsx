import FollowUpsView from "@/components/FollowUpsView";
import PageHeader from "@/components/PageHeader";

export default function Page() {
  return (
    <>
      <PageHeader
        title="Follow-ups"
        description="Overdue and upcoming items across all deals."
      />
      <FollowUpsView />
    </>
  );
}
