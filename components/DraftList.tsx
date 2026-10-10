import DraftEditor from "@/components/DraftEditor";
import type { DraftActions } from "@/lib/data/drafts";
import type { EmailDraft, Person, Transaction } from "@/lib/types";

// A short fingerprint of a draft's text. When regenerating changes the text,
// the fingerprint changes and the editor below starts over from the new text.
function fingerprint(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h;
}

// Drafts that are not sent come first, then the ones marked as sent, under
// separate headings so the two are never confused.
export default function DraftList({
  drafts,
  people,
  transactions,
  actions,
  showDeal = false,
  emptyText = "No drafts yet.",
}: {
  drafts: EmailDraft[];
  people: Person[];
  transactions?: Transaction[];
  actions: DraftActions;
  showDeal?: boolean;
  emptyText?: string;
}) {
  const unsent = drafts
    .filter((d) => d.status !== "sent")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sent = drafts
    .filter((d) => d.status === "sent")
    .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""));

  const render = (d: EmailDraft) => (
    <DraftEditor
      key={`${d.id}:${d.status}:${fingerprint(d.recipientEmail + d.subject + d.body)}`}
      draft={d}
      recipient={people.find((p) => p.id === d.recipientId)}
      dealLabel={showDeal ? transactions?.find((t) => t.id === d.transactionId)?.propertyAddress : undefined}
      actions={actions}
    />
  );

  if (drafts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {unsent.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-slate-900">
            Drafts <span className="font-normal text-slate-500">({unsent.length}): not sent</span>
          </h2>
          {unsent.map(render)}
        </section>
      )}
      {sent.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-slate-900">
            Marked as sent <span className="font-normal text-slate-500">({sent.length})</span>
          </h2>
          {sent.map(render)}
        </section>
      )}
    </div>
  );
}
