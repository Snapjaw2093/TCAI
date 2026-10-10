import OnboardingView from "@/components/OnboardingView";
import PageHeader from "@/components/PageHeader";

export default function Page() {
  return (
    <>
      <PageHeader
        title="Onboarding"
        description="Get new deals set up: details, checklist, and welcome emails."
      />
      <OnboardingView />
    </>
  );
}
