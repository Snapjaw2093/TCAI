import PageHeader from "@/components/PageHeader";
import SettingsNav from "@/components/SettingsNav";
import TemplateEditor from "@/components/TemplateEditor";

export default function Page() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Checklists and email wording that new deals and drafts start from."
      />
      <SettingsNav />
      <TemplateEditor />
    </>
  );
}
