import { formatDate, isOverdue } from "@/lib/format";
import type { DocumentFile, DocumentItem } from "@/lib/types";

export default function DocumentList({
  documents,
  files = [],
  onChange,
}: {
  documents: DocumentItem[];
  files?: DocumentFile[];
  onChange: (document: DocumentItem) => void;
}) {
  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {documents.map((doc) => {
        const late = doc.status !== "received" && isOverdue(doc.dueDate);
        return (
          <li key={doc.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-900">{doc.name}</p>
              <p className="text-xs text-slate-500">
                {doc.required ? "Required" : "Optional"}
                {files.filter((f) => f.documentId === doc.id).length > 0 &&
                  ` · ${files.filter((f) => f.documentId === doc.id).length} file${files.filter((f) => f.documentId === doc.id).length === 1 ? "" : "s"} attached`}
              </p>
            </div>
            <span className={`text-xs ${late ? "font-medium text-rose-600" : "text-slate-500"}`}>
              {late && "Overdue · "}
              {doc.dueDate ? formatDate(doc.dueDate) : "No due date"}
            </span>
            <select
              value={doc.status}
              onChange={(e) =>
                onChange({ ...doc, status: e.target.value as DocumentItem["status"] })
              }
              aria-label={`Status of ${doc.name}`}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
            >
              <option value="needed">Needed</option>
              <option value="requested">Requested</option>
              <option value="received">Received</option>
            </select>
          </li>
        );
      })}
    </ul>
  );
}
