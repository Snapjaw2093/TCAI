"use client";

import { useMemo, useRef, useState } from "react";
import {
  defaultEmailTemplates,
  emailTemplateInfo,
  findUnknownPlaceholders,
  placeholders,
  previewEmail,
} from "@/lib/templates/emails";
import type { EmailTemplateKey, EmailTemplates } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const keys = Object.keys(emailTemplateInfo) as EmailTemplateKey[];

export default function EmailTemplateEditor({
  templates,
  signature,
  onChange,
}: {
  templates: EmailTemplates;
  signature: string;
  onChange: (templates: EmailTemplates) => void;
}) {
  const [selected, setSelected] = useState<EmailTemplateKey>("welcomeClient");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const template = templates[selected];

  const set = (patch: Partial<typeof template>) =>
    onChange({ ...templates, [selected]: { ...template, ...patch } });

  // Types {{name}} where the cursor is in the body.
  function insert(name: string) {
    const box = bodyRef.current;
    const text = `{{${name}}}`;
    if (!box) return set({ body: template.body + text });
    const start = box.selectionStart;
    const end = box.selectionEnd;
    set({ body: template.body.slice(0, start) + text + template.body.slice(end) });
    requestAnimationFrame(() => {
      box.focus();
      box.setSelectionRange(start + text.length, start + text.length);
    });
  }

  const unknown = useMemo(
    () => [...new Set([...findUnknownPlaceholders(template.subject), ...findUnknownPlaceholders(template.body)])],
    [template],
  );
  const preview = useMemo(() => previewEmail(selected, template, signature), [selected, template, signature]);
  const changed =
    template.subject !== defaultEmailTemplates[selected].subject ||
    template.body !== defaultEmailTemplates[selected].body;

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
      <ul className="flex gap-2 overflow-x-auto lg:flex-col">
        {keys.map((key) => (
          <li key={key} className="shrink-0">
            <button
              onClick={() => setSelected(key)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                selected === key
                  ? "bg-indigo-50 font-medium text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {emailTemplateInfo[key].label}
              {(templates[key].subject !== defaultEmailTemplates[key].subject ||
                templates[key].body !== defaultEmailTemplates[key].body) && (
                <span className="ml-1.5 text-xs text-amber-600">edited</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <div className="space-y-5">
        <p className="text-sm text-slate-500">{emailTemplateInfo[selected].when}</p>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Subject</span>
          <input value={template.subject} onChange={(e) => set({ subject: e.target.value })} className={inputClass} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
          <textarea
            ref={bodyRef}
            value={template.body}
            onChange={(e) => set({ body: e.target.value })}
            rows={16}
            className={`${inputClass} font-mono leading-relaxed`}
          />
        </label>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Click to add a blank that gets filled in for each deal
          </p>
          <div className="flex flex-wrap gap-1.5">
            {placeholders.map((p) => (
              <button
                key={p.name}
                onClick={() => insert(p.name)}
                title={p.description + (p.block ? " (add |Your heading to change its title)" : "")}
                className="rounded-full border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs text-slate-700 hover:bg-slate-50"
              >
                {p.block ? `${p.name}` : p.name}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Lists such as <code>documents_needed</code> are left out when empty. To change a list&apos;s
            title, write it like <code>{"{{documents_needed|Docs we still need}}"}</code>.
          </p>
        </div>

        {unknown.length > 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Not a known blank: {unknown.map((u) => `{{${u}}}`).join(", ")}. It will show up as-is in
            your emails. Check the spelling.
          </p>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            Preview with a made-up deal
          </p>
          <p className="text-sm font-medium text-slate-900">{preview.subject || "(no subject)"}</p>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
            {preview.body}
          </pre>
        </div>

        {changed && (
          <button
            onClick={() => set(defaultEmailTemplates[selected])}
            className="text-sm text-slate-500 hover:text-rose-600"
          >
            Reset this email to the built-in wording
          </button>
        )}
      </div>
    </div>
  );
}
