import { addDays, format, parseISO } from "date-fns";
import type {
  ChecklistTemplate,
  ChecklistTemplates,
  DocumentItem,
  DueRule,
  Task,
  TransactionType,
} from "@/lib/types";

// These are the built-in checklists. You can change them on the Templates
// page; your changes are saved and used instead of these.
// "dueDays" means: this many days after (+) or before (-) the anchor date.

const shared: ChecklistTemplate = {
  tasks: [
    { title: "Send welcome email to client and agent", category: "Communication", key: "welcome-email" },
    { title: "Confirm contract is fully executed", category: "Contract", due: { anchor: "contract", dueDays: 1 } },
    { title: "Open title / escrow", category: "Title & escrow", due: { anchor: "contract", dueDays: 2 } },
    { title: "Deliver earnest money deposit", category: "Title & escrow", due: { anchor: "contract", dueDays: 3 } },
    { title: "Order or confirm inspection", category: "Inspection & appraisal", due: { anchor: "contract", dueDays: 5 } },
    { title: "Final walk-through scheduled", category: "Closing", due: { anchor: "closing", dueDays: -2 } },
    { title: "Confirm closing time and location", category: "Closing", due: { anchor: "closing", dueDays: -3 } },
  ],
  documents: [
    { name: "Fully executed purchase agreement", required: true, due: { anchor: "contract", dueDays: 1 } },
    { name: "Agency disclosure", required: true, due: { anchor: "contract", dueDays: 1 } },
    { name: "Earnest money receipt", required: true, due: { anchor: "contract", dueDays: 3 } },
  ],
};

export const defaultChecklistTemplates: ChecklistTemplates = {
  buyer: {
    tasks: [
      ...shared.tasks,
      { title: "Confirm loan application submitted", category: "Financing", due: { anchor: "contract", dueDays: 5 } },
      { title: "Confirm appraisal ordered", category: "Inspection & appraisal", due: { anchor: "contract", dueDays: 7 } },
      { title: "Confirm homeowner's insurance bound", category: "Financing", due: { anchor: "closing", dueDays: -10 } },
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
      { title: "Send seller disclosures to buyer's agent", category: "Disclosures", due: { anchor: "contract", dueDays: 3 } },
      { title: "Request payoff statement from lender", category: "Title & escrow", due: { anchor: "closing", dueDays: -14 } },
      { title: "Confirm repair requests and responses", category: "Inspection & appraisal", due: { anchor: "contract", dueDays: 12 } },
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
  due: DueRule | null | undefined,
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
  templates: ChecklistTemplates = defaultChecklistTemplates,
): {
  tasks: Omit<Task, "id" | "transactionId">[];
  documents: Omit<DocumentItem, "id" | "transactionId">[];
} {
  const template = templates[type];
  return {
    tasks: template.tasks.map((t) => ({
      title: t.title,
      dueDate: dueDate(t.due, contractDate, closingDate),
      status: "open" as const,
      key: t.key,
      category: t.category,
    })),
    documents: template.documents.map((d) => ({
      name: d.name,
      required: d.required,
      status: "needed" as const,
      dueDate: dueDate(d.due, contractDate, closingDate),
    })),
  };
}
