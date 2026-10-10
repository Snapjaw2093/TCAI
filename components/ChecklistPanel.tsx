import { formatDate, isOverdue } from "@/lib/format";
import type { Task } from "@/lib/types";

export default function ChecklistPanel({
  tasks,
  onChange,
}: {
  tasks: Task[];
  onChange: (task: Task) => void;
}) {
  // Earliest due date first; tasks with no date go last.
  const sorted = [...tasks].sort((a, b) =>
    (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"),
  );

  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {sorted.map((task) => {
        const finished = task.status !== "open";
        const late = !finished && isOverdue(task.dueDate);
        return (
          <li key={task.id} className="flex items-center gap-3 px-5 py-3">
            <input
              type="checkbox"
              checked={task.status === "done"}
              onChange={(e) =>
                onChange({ ...task, status: e.target.checked ? "done" : "open" })
              }
              aria-label={`Mark "${task.title}" done`}
              className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
            />
            <span
              className={`flex-1 text-sm ${
                finished ? "text-slate-400 line-through" : "text-slate-900"
              }`}
            >
              {task.title}
            </span>
            <span className={`text-xs ${late ? "font-medium text-rose-600" : "text-slate-500"}`}>
              {late && "Overdue · "}
              {task.dueDate ? formatDate(task.dueDate) : "No due date"}
            </span>
            {task.status === "skipped" ? (
              <button
                onClick={() => onChange({ ...task, status: "open" })}
                className="text-xs text-indigo-600 hover:underline"
              >
                Restore
              </button>
            ) : (
              task.status === "open" && (
                <button
                  onClick={() => onChange({ ...task, status: "skipped" })}
                  className="text-xs text-slate-400 hover:text-slate-700"
                >
                  Skip
                </button>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}
