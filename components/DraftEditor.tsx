"use client";

import { useState } from "react";
import type { EmailDraft, Person } from "@/lib/types";

const statusStyles: Record<EmailDraft["status"], string> = {
  draft: "bg-slate-100 text-slate-600",
  approved: "bg-emerald-50 text-emerald-700",
  sent: "bg-indigo-50 text-indigo-700",
};

const button =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50";

export default function DraftEditor({
  draft,
  recipient,
  onChange,
  onDelete,
}: {
  draft: EmailDraft;
  recipient: Person | undefined;
  onChange: (draft: EmailDraft) => void;
  onDelete: (draft: EmailDraft) => void;
}) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [copied, setCopied] = useState(false);

  const sent = draft.status === "sent";
  const unsaved = subject !== draft.subject || body !== draft.body;

  // Saving an edit sends an approved draft back to "draft" so it gets re-checked.
  function save() {
    onChange({ ...draft, subject, body, status: "draft" });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked by the browser; select-all + copy still works.
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">To:</span>
        <span className="font-medium text-slate-900">
          {recipient ? `${recipient.name} <${recipient.email}>` : "Unknown recipient"}
        </span>
        <span
          className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusStyles[draft.status]}`}
        >
          {draft.status}
        </span>
      </div>

      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        disabled={sent}
        aria-label="Subject"
        className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:bg-slate-50 disabled:text-slate-500"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={sent}
        rows={14}
        aria-label="Email body"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm leading-relaxed disabled:bg-slate-50 disabled:text-slate-500"
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!sent && (
          <>
            <button onClick={save} disabled={!unsaved} className={`${button} disabled:opacity-40`}>
              Save changes
            </button>
            {draft.status === "draft" && !unsaved && (
              <button
                onClick={() => onChange({ ...draft, status: "approved" })}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Approve
              </button>
            )}
          </>
        )}
        <button onClick={copy} className={button}>
          {copied ? "Copied!" : "Copy"}
        </button>
        {draft.status === "approved" && !unsaved && (
          <button
            onClick={() =>
              onChange({ ...draft, status: "sent", sentAt: new Date().toISOString() })
            }
            className={button}
          >
            Mark as sent
          </button>
        )}
        {!sent && (
          <button
            onClick={() => onDelete(draft)}
            className="ml-auto text-sm text-slate-400 hover:text-rose-600"
          >
            Discard
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {sent
          ? `Marked as sent ${draft.sentAt ? new Date(draft.sentAt).toLocaleString() : ""}.`
          : "TC Assistant never sends email. Copy this into your email app, send it there, then mark it as sent here."}
      </p>
    </div>
  );
}
