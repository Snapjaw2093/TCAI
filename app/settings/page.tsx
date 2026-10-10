import PageHeader from "@/components/PageHeader";
import SettingsForm from "@/components/SettingsForm";

export default function Page() {
  return (
    <>
      <PageHeader title="Settings" description="Your signature and app data." />
      <SettingsForm />
    </>
  );
}
