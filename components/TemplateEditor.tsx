"use client";

import { useEffect, useState } from "react";
import ChecklistEditor from "@/components/templates/ChecklistEditor";
import EmailTemplateEditor from "@/components/templates/EmailTemplateEditor";
import { db } from "@/lib/data";
import { defaultTemplates } from "@/lib/templates";
import { buildSignature } from "@/lib/templates/emails";
import type { ChecklistTemplates, UserTemplates } from "@/lib/types";

const tabs = ["Checklists", "Emails"] as const;

// Blank rows are dropped when saving, and day counts are whole numbers.
function tidy(checklists: ChecklistTemplates): ChecklistTemplates {
  const clean = (rule: { anchor: "contract" | "closing"; dueDays: number } | null | undefined) =>
    rule ? { ...rule, dueDays: Math.round(rule.dueDays) } : null;
  const result = { ...checklists };
  for (const side of ["buyer", "seller"] as const) {
    result[side] = {
      tasks: checklists[side].tasks
        .filter((t) => t.title.trim())
        .map((t) => ({ ...t, title: t.title.trim(), due: clean(t.due) })),
      documents: checklists[side].documents
        .filter((d) => d.name.trim())
        .map((d) => ({ ...d, name: d.name.trim(), due: clean(d.due) })),
    };
  }
  return result;
}

export default function TemplateEditor() {
  const [saved, setSaved] = useState<UserTemplates | null>(null);
  const [draft, setDraft] = useState<UserTemplates | null>(null);
  const [signature, setSignature] = useState("");
  const [tab, setTab] = useState<(typeof tabs)[number]>("Checklists");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const templates = await db.getTemplates();
      setSaved(templates);
      setDraft(templates);
      setSignature(buildSignature(await db.getSettings()));
    }
    load();
  }, []);

  if (!saved || !draft) return <p className="text-sm text-slate-500">Loading…</p>;

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    const next = { ...draft, checklists: tidy(draft.checklists) };
    try {
      await db.saveTemplates(next);
      setSaved(next);
      setDraft(next);
      setMessage({ text: "Saved. New deals and new drafts will use these.", ok: true });
    } catch (e) {
      setMessage({
        text: `Couldn't save: ${e instanceof Error ? e.message : "unknown error"}. If you haven't yet, run the latest supabase/schema.sql in the Supabase SQL Editor, then try again.`,
        ok: false,
      });
    }
    setSaving(false);
  }

  return (
    <div className="pb-24">
      <p className="mb-6 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">
        Changes apply to <strong>new</strong> deals and drafts. Deals you&apos;ve already created keep the
        checklists they have.
      </p>

      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {tabs.map((name) => (
          <button
            key={name}
            onClick={() => setTab(name)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === name
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === "Checklists" ? (
        <ChecklistEditor
          templates={draft.checklists}
          onChange={(checklists) => setDraft({ ...draft, checklists })}
        />
      ) : (
        <EmailTemplateEditor
          templates={draft.emails}
          signature={signature}
          onChange={(emails) => setDraft({ ...draft, emails })}
        />
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 px-6 py-3 backdrop-blur md:left-60">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {dirty && <span className="text-sm text-amber-700">Unsaved changes</span>}
          {message && (
            <span className={`text-sm ${message.ok ? "text-emerald-700" : "text-rose-600"}`}>
              {message.text}
            </span>
          )}
          <button
            onClick={() => {
              if (window.confirm("Put every checklist and email back to the built-in version? Nothing is saved until you click Save.")) {
                setDraft(defaultTemplates);
                setMessage(null);
              }
            }}
            className="ml-auto text-sm text-slate-500 hover:text-rose-600"
          >
            Reset everything to built-in
          </button>
        </div>
      </div>
    </div>
  );
}
