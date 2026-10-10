import PageHeader from "@/components/PageHeader";
import SettingsNav from "@/components/SettingsNav";
import SettingsForm from "@/components/SettingsForm";

export default function Page() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Your signature, defaults, task categories, and app data."
      />
      <SettingsNav />
      <SettingsForm />
    </>
  );
}
