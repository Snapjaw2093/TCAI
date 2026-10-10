import DraftEditor from "@/components/DraftEditor";
import type { EmailDraft, Person } from "@/lib/types";

export default function EmailsPanel({
  drafts,
  client,
  agent,
  people,
  onCreateWelcome,
  onChange,
  onDelete,
}: {
  drafts: EmailDraft[];
  client: Person | undefined;
  agent: Person | undefined;
  people: Person[];
  onCreateWelcome: (recipient: Person) => void;
  onChange: (draft: EmailDraft) => void;
  onDelete: (draft: EmailDraft) => void;
}) {
  const newest = [...drafts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600">Draft a welcome email to:</span>
        {[client, agent].map(
          (person) =>
            person && (
              <button
                key={person.id}
                onClick={() => onCreateWelcome(person)}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                {person.role === "client" ? "Client" : "Agent"} ({person.name})
              </button>
            ),
        )}
      </div>

      {newest.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="font-medium text-slate-900">No email drafts yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Pick a recipient above and we&apos;ll write a first draft you can edit.
          </p>
        </div>
      ) : (
        newest.map((draft) => (
          <DraftEditor
            key={draft.id}
            draft={draft}
            recipient={people.find((p) => p.id === draft.recipientId)}
            onChange={onChange}
            onDelete={onDelete}
          />
        ))
      )}
    </div>
  );
}
