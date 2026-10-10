"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { generateDraft, type DraftPurpose } from "@/lib/data/drafts";
import type { EmailDraft, Person } from "@/lib/types";

// "Draft a welcome email / follow-up to the client / agent" for one deal.
export default function NewDraftButtons({
  transactionId,
  client,
  agent,
  onCreated,
}: {
  transactionId: string;
  client: Person | undefined;
  agent: Person | undefined;
  onCreated: (draft: EmailDraft) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function create(person: Person, purpose: DraftPurpose) {
    setBusy(true);
    try {
      onCreated(await generateDraft(transactionId, person.id, purpose));
      toast(`Draft created for ${person.name}. Review it below.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't create the draft.", "error");
    }
    setBusy(false);
  }

  const groups: { purpose: DraftPurpose; label: string }[] = [
    { purpose: "welcome", label: "Welcome email" },
    { purpose: "follow-up", label: "Follow-up" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      {groups.map(({ purpose, label }) => (
        <div key={purpose} className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">{label}:</span>
          {[client, agent].map(
            (person) =>
              person && (
                <button
                  key={person.id}
                  onClick={() => create(person, purpose)}
                  disabled={busy}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  to {person.role} ({person.name})
                </button>
              ),
          )}
        </div>
      ))}
    </div>
  );
}
