import { addDays, format, parseISO } from "date-fns";
import type { DocumentItem, Task, TransactionType } from "@/lib/types";

// Templates are plain lists. To change a checklist, edit the list below.
// "dueDays" means: this many days after (+) or before (-) the anchor date.

type Anchor = "contract" | "closing";
type Due = { anchor: Anchor; dueDays: number };

type TaskTemplate = { title: string; due?: Due };
type DocumentTemplate = { name: string; required: boolean; due?: Due };

type ChecklistTemplate = {
  tasks: TaskTemplate[];
  documents: DocumentTemplate[];
};

const shared: ChecklistTemplate = {
  tasks: [
    { title: "Send welcome email to client and agent" },
    { title: "Confirm contract is fully executed", due: { anchor: "contract", dueDays: 1 } },
    { title: "Open title / escrow", due: { anchor: "contract", dueDays: 2 } },
    { title: "Deliver earnest money deposit", due: { anchor: "contract", dueDays: 3 } },
    { title: "Order or confirm inspection", due: { anchor: "contract", dueDays: 5 } },
    { title: "Final walk-through scheduled", due: { anchor: "closing", dueDays: -2 } },
    { title: "Confirm closing time and location", due: { anchor: "closing", dueDays: -3 } },
  ],
  documents: [
    { name: "Fully executed purchase agreement", required: true, due: { anchor: "contract", dueDays: 1 } },
    { name: "Agency disclosure", required: true, due: { anchor: "contract", dueDays: 1 } },
    { name: "Earnest money receipt", required: true, due: { anchor: "contract", dueDays: 3 } },
  ],
};

export const checklistTemplates: Record<TransactionType, ChecklistTemplate> = {
  buyer: {
    tasks: [
      ...shared.tasks,
      { title: "Confirm loan application submitted", due: { anchor: "contract", dueDays: 5 } },
      { title: "Confirm appraisal ordered", due: { anchor: "contract", dueDays: 7 } },
      { title: "Confirm homeowner's insurance bound", due: { anchor: "closing", dueDays: -10 } },
    ],
    documents: [
      ...shared.documents,
      { name: "Pre-approval letter", required: true, due: { anchor: "contract", dueDays: 1 } },
      { name: "Inspection report", required: false, due: { anchor: "contract", dueDays: 10 } },
      { name: "Proof of homeowner's insurance", required: true, due: { anchor: "closing", dueDays: -7 } },
    ],
  },
  seller: {
    tasks: [
      ...shared.tasks,
      { title: "Send seller disclosures to buyer's agent", due: { anchor: "contract", dueDays: 3 } },
      { title: "Request payoff statement from lender", due: { anchor: "closing", dueDays: -14 } },
      { title: "Confirm repair requests and responses", due: { anchor: "contract", dueDays: 12 } },
    ],
    documents: [
      ...shared.documents,
      { name: "Seller's property disclosure", required: true, due: { anchor: "contract", dueDays: 3 } },
      { name: "HOA documents", required: false, due: { anchor: "contract", dueDays: 5 } },
      { name: "Mortgage payoff statement", required: true, due: { anchor: "closing", dueDays: -10 } },
    ],
  },
};

function dueDate(
  due: Due | undefined,
  contractDate: string | null,
  closingDate: string | null,
): string | null {
  if (!due) return null;
  const anchor = due.anchor === "contract" ? contractDate : closingDate;
  if (!anchor) return null; // no date to count from yet
  return format(addDays(parseISO(anchor), due.dueDays), "yyyy-MM-dd");
}

// Turns a template into real tasks/documents for one transaction.
// (ids are filled in by the data layer when they are saved)
export function buildChecklist(
  type: TransactionType,
  contractDate: string | null,
  closingDate: string | null,
): {
  tasks: Omit<Task, "id" | "transactionId">[];
  documents: Omit<DocumentItem, "id" | "transactionId">[];
} {
  const template = checklistTemplates[type];
  return {
    tasks: template.tasks.map((t) => ({
      title: t.title,
      dueDate: dueDate(t.due, contractDate, closingDate),
      status: "open" as const,
    })),
    documents: template.documents.map((d) => ({
      name: d.name,
      required: d.required,
      status: "needed" as const,
      dueDate: dueDate(d.due, contractDate, closingDate),
    })),
  };
}
