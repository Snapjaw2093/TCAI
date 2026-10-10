import EmailFollowUpsView from "@/components/EmailFollowUpsView";
import PageHeader from "@/components/PageHeader";

export default function Page() {
  return (
    <>
      <PageHeader
        title="Email & Follow-ups"
        description="See what needs chasing, draft the emails, and track what you've sent."
      />
      <EmailFollowUpsView />
    </>
  );
}
