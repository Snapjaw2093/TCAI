import PageHeader from "@/components/PageHeader";
import TemplateEditor from "@/components/TemplateEditor";

export default function Page() {
  return (
    <>
      <PageHeader
        title="Templates"
        description="Change the checklists and email wording that new deals start from."
      />
      <TemplateEditor />
    </>
  );
}
