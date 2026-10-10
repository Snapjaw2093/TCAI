"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastProvider";
import type { DraftActions } from "@/lib/data/drafts";
import type { EmailDraft, Person } from "@/lib/types";

// One email draft you can edit. The three states look different on purpose:
//   Draft    - written by the app (from your templates), nothing sent
//   Approved - you checked it; ready for YOU to send from your email app
//   Sent     - you told us you sent it. The app never sends email itself.

const styles = {
  draft: { bar: "border-l-amber-400", badge: "bg-amber-50 text-amber-800", label: "Draft · not sent" },
  approved: { bar: "border-l-emerald-500", badge: "bg-emerald-50 text-emerald-800", label: "Approved · ready for you to send" },
  sent: { bar: "border-l-slate-400", badge: "bg-slate-100 text-slate-700", label: "Marked as sent" },
} as const;

const button =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40";
const field =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500";

export default function DraftEditor({
  draft,
  recipient,
  dealLabel,
  actions,
}: {
  draft: EmailDraft;
  recipient: Person | undefined;
  dealLabel?: string;
  actions: DraftActions;
}) {
  const toast = useToast();
  const [to, setTo] = useState(draft.recipientEmail || recipient?.email || "");
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const state = styles[draft.status];
  const sent = draft.status === "sent";
  const dirty =
    to !== (draft.recipientEmail || recipient?.email || "") ||
    subject !== draft.subject ||
    body !== draft.body;

  // Runs an action, shows a message when it works or fails.
  async function run(task: () => Promise<void>, success: string) {
    setBusy(true);
    try {
      await task();
      toast(success);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong.", "error");
    }
    setBusy(false);
  }

  function valid(): boolean {
    if (!/^\S+@\S+\.\S+$/.test(to.trim())) {
      setError("Enter a valid email address in To.");
      return false;
    }
    if (!subject.trim()) {
      setError("Add a subject.");
      return false;
    }
    setError("");
    return true;
  }

  // Saving an edit sends an approved draft back to "draft" so it gets re-checked.
  const edited = (): EmailDraft => ({ ...draft, recipientEmail: to.trim(), subject, body });

  async function copy() {
    try {
      await navigator.clipboard.writeText(`To: ${to}\nSubject: ${subject}\n\n${body}`);
      toast("Copied. Paste it into your email app.");
    } catch {
      toast("Your browser blocked copying. Select the text and copy it by hand.", "error");
    }
  }

  return (
    <div className={`rounded-xl border border-l-4 border-slate-200 bg-white p-5 ${state.bar}`}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${state.badge}`}>{state.label}</span>
        {dealLabel && <span className="text-sm text-slate-500">{dealLabel}</span>}
        {sent && draft.sentAt && (
          <span className="text-xs text-slate-500">on {new Date(draft.sentAt).toLocaleString()}</span>
        )}
        <span className="ml-auto text-xs capitalize text-slate-400">{draft.kind.replace("-", " ")} email</span>
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-sm text-slate-500">To</span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={sent}
            type="email"
            aria-label="To address"
            placeholder={recipient ? `${recipient.name} <email>` : "name@example.com"}
            className={field}
          />
        </label>
        {recipient && !sent && (
          <p className="-mt-1 pl-[4.75rem] text-xs text-slate-500">
            Written for {recipient.name} ({recipient.role}). You can change the address to send it elsewhere.
          </p>
        )}
        <label className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-sm text-slate-500">Subject</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={sent}
            aria-label="Subject"
            className={`${field} font-medium`}
          />
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={sent}
          rows={14}
          aria-label="Email body"
          className={`${field} font-mono leading-relaxed`}
        />
      </div>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!sent && (
          <>
            <button
              onClick={() => valid() && run(() => actions.save(edited()), "Draft saved.")}
              disabled={!dirty || busy}
              className={button}
            >
              Save draft
            </button>
            {draft.status === "draft" && !dirty && (
              <button
                onClick={() => run(() => actions.save({ ...draft, status: "approved" }), "Approved. Copy it and send it from your email app.")}
                disabled={busy}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                Approve
              </button>
            )}
            <button
              onClick={() => {
                if (
                  window.confirm(
                    "Replace this draft with a freshly generated one? Changes you made to the subject and message will be lost.",
                  )
                ) {
                  run(() => actions.regenerate(draft), "Draft regenerated from the latest deal details.");
                }
              }}
              disabled={busy}
              className={button}
            >
              Regenerate
            </button>
          </>
        )}
        <button onClick={copy} className={button}>
          Copy
        </button>
        {draft.status === "approved" && !dirty && (
          <button
            onClick={() =>
              run(
                () => actions.save({ ...draft, status: "sent", sentAt: new Date().toISOString() }),
                "Marked as sent.",
              )
            }
            disabled={busy}
            className={button}
          >
            Mark as sent
          </button>
        )}
        {!sent && (
          <button
            onClick={() => run(() => actions.remove(draft), "Draft discarded.")}
            disabled={busy}
            className="ml-auto text-sm text-slate-400 hover:text-rose-600"
          >
            Discard
          </button>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {sent
          ? "You sent this from your own email app and marked it here. TC Assistant doesn't send email."
          : "TC Assistant never sends email. The text is filled in from your templates. Copy it into your email app, send it there, then mark it as sent here."}
      </p>
    </div>
  );
}
