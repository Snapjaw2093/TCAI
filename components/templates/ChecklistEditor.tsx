"use client";

import { useState } from "react";
import type {
  ChecklistTemplate,
  ChecklistTemplates,
  DueRule,
  TransactionType,
} from "@/lib/types";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

// The due date is edited as "[number] days [before/after] the [contract/closing] date".
type Mode = "none" | "after-contract" | "before-contract" | "after-closing" | "before-closing";

function toControl(rule: DueRule | null | undefined): { mode: Mode; days: number } {
  if (!rule) return { mode: "none", days: 0 };
  const direction = rule.dueDays < 0 ? "before" : "after";
  return { mode: `${direction}-${rule.anchor}` as Mode, days: Math.abs(rule.dueDays) };
}

function toRule(mode: Mode, days: number): DueRule | null {
  if (mode === "none") return null;
  const [direction, anchor] = mode.split("-") as ["before" | "after", "contract" | "closing"];
  return { anchor, dueDays: direction === "before" ? -days : days };
}

function DueEditor({
  rule,
  onChange,
}: {
  rule: DueRule | null | undefined;
  onChange: (rule: DueRule | null) => void;
}) {
  const { mode, days } = toControl(rule);
  return (
    <span className="flex items-center gap-2">
      {mode !== "none" && (
        <input
          type="number"
          min={0}
          value={days}
          onChange={(e) => onChange(toRule(mode, Math.max(0, Math.round(Number(e.target.value) || 0))))}
          aria-label="Number of days"
          className={`${inputClass} w-16`}
        />
      )}
      <select
        value={mode}
        onChange={(e) => onChange(toRule(e.target.value as Mode, days))}
        aria-label="When it is due"
        className={inputClass}
      >
        <option value="none">No due date</option>
        <option value="after-contract">days after contract</option>
        <option value="before-contract">days before contract</option>
        <option value="after-closing">days after closing</option>
        <option value="before-closing">days before closing</option>
      </select>
    </span>
  );
}

// Small up / down / remove buttons shared by every row.
function RowButtons({
  index,
  count,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}) {
  const small = "rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30";
  return (
    <span className="flex items-center">
      <button type="button" onClick={() => onMove(index, index - 1)} disabled={index === 0} aria-label="Move up" className={small}>
        ↑
      </button>
      <button type="button" onClick={() => onMove(index, index + 1)} disabled={index === count - 1} aria-label="Move down" className={small}>
        ↓
      </button>
      <button type="button" onClick={() => onRemove(index)} aria-label="Remove" className={`${small} hover:text-rose-600`}>
        ✕
      </button>
    </span>
  );
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

export default function ChecklistEditor({
  templates,
  categories,
  onChange,
}: {
  templates: ChecklistTemplates;
  categories: string[];
  onChange: (templates: ChecklistTemplates) => void;
}) {
  const [side, setSide] = useState<TransactionType>("buyer");
  const template = templates[side];

  const update = (next: ChecklistTemplate) => onChange({ ...templates, [side]: next });

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {(["buyer", "seller"] as const).map((type) => (
          <button
            key={type}
            onClick={() => setSide(type)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
              side === type
                ? "bg-indigo-600 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {type === "buyer" ? "Buyer side" : "Seller side"}
          </button>
        ))}
      </div>

      <section>
        <h2 className="mb-2 font-medium text-slate-900">Tasks</h2>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {template.tasks.map((task, i) => (
            <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <input
                value={task.title}
                onChange={(e) =>
                  update({ ...template, tasks: template.tasks.map((t, j) => (j === i ? { ...t, title: e.target.value } : t)) })
                }
                aria-label="Task name"
                className={`${inputClass} min-w-0 flex-1 basis-full sm:basis-64`}
              />
              <select
                value={task.category ?? ""}
                onChange={(e) =>
                  update({
                    ...template,
                    tasks: template.tasks.map((t, j) => (j === i ? { ...t, category: e.target.value || undefined } : t)),
                  })
                }
                aria-label="Category"
                className={inputClass}
              >
                <option value="">No category</option>
                {/* a category that was since removed from Settings stays selectable */}
                {[...new Set([...categories, ...(task.category ? [task.category] : [])])].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <DueEditor
                rule={task.due}
                onChange={(due) =>
                  update({ ...template, tasks: template.tasks.map((t, j) => (j === i ? { ...t, due } : t)) })
                }
              />
              <RowButtons
                index={i}
                count={template.tasks.length}
                onMove={(from, to) => update({ ...template, tasks: moveItem(template.tasks, from, to) })}
                onRemove={(index) => update({ ...template, tasks: template.tasks.filter((_, j) => j !== index) })}
              />
              {task.key === "welcome-email" && (
                <p className="basis-full text-xs text-slate-500">
                  Ticked off automatically when you mark a welcome email as sent.
                </p>
              )}
            </li>
          ))}
        </ul>
        <button
          onClick={() => update({ ...template, tasks: [...template.tasks, { title: "", due: null }] })}
          className="mt-2 text-sm font-medium text-indigo-600 hover:underline"
        >
          + Add task
        </button>
      </section>

      <section>
        <h2 className="mb-2 font-medium text-slate-900">Documents</h2>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {template.documents.map((doc, i) => (
            <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <input
                value={doc.name}
                onChange={(e) =>
                  update({ ...template, documents: template.documents.map((d, j) => (j === i ? { ...d, name: e.target.value } : d)) })
                }
                aria-label="Document name"
                className={`${inputClass} min-w-0 flex-1 basis-full sm:basis-64`}
              />
              <label className="flex items-center gap-1.5 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={doc.required}
                  onChange={(e) =>
                    update({ ...template, documents: template.documents.map((d, j) => (j === i ? { ...d, required: e.target.checked } : d)) })
                  }
                  className="h-4 w-4 accent-indigo-600"
                />
                Required
              </label>
              <DueEditor
                rule={doc.due}
                onChange={(due) =>
                  update({ ...template, documents: template.documents.map((d, j) => (j === i ? { ...d, due } : d)) })
                }
              />
              <RowButtons
                index={i}
                count={template.documents.length}
                onMove={(from, to) => update({ ...template, documents: moveItem(template.documents, from, to) })}
                onRemove={(index) => update({ ...template, documents: template.documents.filter((_, j) => j !== index) })}
              />
            </li>
          ))}
        </ul>
        <button
          onClick={() => update({ ...template, documents: [...template.documents, { name: "", required: true, due: null }] })}
          className="mt-2 text-sm font-medium text-indigo-600 hover:underline"
        >
          + Add document
        </button>
      </section>
    </div>
  );
}
