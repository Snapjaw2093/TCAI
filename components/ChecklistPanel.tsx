"use client";

import { useState } from "react";
import { formatDate, isOverdue } from "@/lib/format";
import type { Task } from "@/lib/types";

export default function ChecklistPanel({
  tasks,
  categories,
  onChange,
}: {
  tasks: Task[];
  categories: string[];
  onChange: (task: Task) => void;
}) {
  const [category, setCategory] = useState("all");

  // Categories from Settings, plus any a task carries that were since removed.
  const used = tasks.map((t) => t.category).filter((c): c is string => !!c);
  const choices = [...new Set([...categories.filter((c) => used.includes(c)), ...used])];
  const hasUncategorized = tasks.some((t) => !t.category);

  // Earliest due date first; tasks with no date go last.
  const visible = tasks
    .filter((t) => category === "all" || (category === "none" ? !t.category : t.category === category))
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));

  return (
    <div className="space-y-3">
      {choices.length > 0 && (
        <div className="flex items-center gap-2">
          <label htmlFor="category-filter" className="text-sm text-slate-500">
            Category
          </label>
          <select
            id="category-filter"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
          >
            <option value="all">All</option>
            {choices.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {hasUncategorized && <option value="none">No category</option>}
          </select>
        </div>
      )}
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {visible.map((task) => {
          const finished = task.status !== "open";
          const late = !finished && isOverdue(task.dueDate);
          return (
            <li key={task.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
              <input
                type="checkbox"
                checked={task.status === "done"}
                onChange={(e) => onChange({ ...task, status: e.target.checked ? "done" : "open" })}
                aria-label={`Mark "${task.title}" done`}
                className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
              />
              <span className={`min-w-0 flex-1 text-sm ${finished ? "text-slate-400 line-through" : "text-slate-900"}`}>
                {task.title}
                {task.category && (
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500 no-underline">
                    {task.category}
                  </span>
                )}
              </span>
              <span className={`text-xs ${late ? "font-medium text-rose-600" : "text-slate-500"}`}>
                {late && "Overdue · "}
                {task.dueDate ? formatDate(task.dueDate) : "No due date"}
              </span>
              {task.status === "skipped" ? (
                <button onClick={() => onChange({ ...task, status: "open" })} className="text-xs text-indigo-600 hover:underline">
                  Restore
                </button>
              ) : (
                task.status === "open" && (
                  <button onClick={() => onChange({ ...task, status: "skipped" })} className="text-xs text-slate-400 hover:text-slate-700">
                    Skip
                  </button>
                )
              )}
            </li>
          );
        })}
        {visible.length === 0 && <li className="px-5 py-6 text-sm text-slate-500">No tasks in this category.</li>}
      </ul>
    </div>
  );
}
