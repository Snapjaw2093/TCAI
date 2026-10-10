import DraftList from "@/components/DraftList";
import NewDraftButtons from "@/components/NewDraftButtons";
import type { DraftActions } from "@/lib/data/drafts";
import type { EmailDraft, Person } from "@/lib/types";

// The Emails tab on a deal.
export default function EmailsPanel({
  transactionId,
  drafts,
  client,
  agent,
  people,
  actions,
  onCreated,
}: {
  transactionId: string;
  drafts: EmailDraft[];
  client: Person | undefined;
  agent: Person | undefined;
  people: Person[];
  actions: DraftActions;
  onCreated: (draft: EmailDraft) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">New draft</p>
        <NewDraftButtons transactionId={transactionId} client={client} agent={agent} onCreated={onCreated} />
      </div>
      <DraftList
        drafts={drafts}
        people={people}
        actions={actions}
        emptyText="No email drafts for this deal yet. Pick one above and we'll fill in a first draft from your templates."
      />
    </div>
  );
}
