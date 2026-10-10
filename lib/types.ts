import type { AiInfo } from "@/lib/ai/types";

// The shape of every record in the app. Think of each type as a form:
// it lists the boxes a record has and what can go in them.
// Dates are plain "YYYY-MM-DD" text so they save cleanly anywhere.

export type TransactionType = "buyer" | "seller";
export type TransactionStatus = "active" | "pending" | "closed" | "cancelled";

export type Person = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "client" | "agent";
};

export type Transaction = {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  propertyAddress: string;
  clientId: string;
  agentId: string;
  contractDate: string | null;
  closingDate: string | null;
  price: number | null;
  notes: string;
  createdAt: string;
  // Archived deals are hidden from lists and the dashboard but never deleted.
  archived: boolean;
};

export type Task = {
  id: string;
  transactionId: string;
  title: string;
  dueDate: string | null;
  status: "open" | "done" | "skipped";
  // Set on tasks the app knows how to complete itself, e.g. "welcome-email".
  key?: string;
  // One of the task categories from Settings, e.g. "Title & escrow".
  category?: string;
};

export type DocumentItem = {
  id: string;
  transactionId: string;
  name: string;
  required: boolean;
  status: "needed" | "requested" | "received";
  dueDate: string | null;
};

export type EmailDraft = {
  id: string;
  transactionId: string;
  // The saved person it was written for. Empty when it is for someone who isn't
  // in the deal (a lender, a title officer...).
  recipientId: string;
  // The address the draft is "to". Starts as the person's email but can be
  // edited, so it is stored on the draft itself.
  recipientEmail: string;
  // "ai" drafts were written by the AI; the others fill in your templates.
  kind: "welcome" | "follow-up" | "ai";
  subject: string;
  body: string;
  status: "draft" | "approved" | "sent";
  createdAt: string;
  sentAt: string | null;
  // For AI drafts: what the AI was told, so you can check the draft against it.
  aiInfo?: AiInfo | null;
};

export const defaultTaskCategories = [
  "Communication",
  "Contract",
  "Disclosures",
  "Title & escrow",
  "Inspection & appraisal",
  "Financing",
  "Closing",
];

// Your signature plus app-wide defaults.
export type Settings = {
  name: string;
  title: string;
  company: string;
  // Which side the "New transaction" form starts on.
  defaultTransactionType: TransactionType;
  // How many days ahead the Follow-ups page and dashboard look.
  followUpDays: number;
  // The labels tasks can be filed under.
  taskCategories: string[];
};

export const defaultSettings: Settings = {
  name: "",
  title: "Transaction Coordinator",
  company: "",
  defaultTransactionType: "buyer",
  followUpDays: 7,
  taskCategories: defaultTaskCategories,
};

// ---- Templates you can edit on the Templates page ----

// "Due 2 days after the contract date" = { anchor: "contract", dueDays: 2 }.
// Negative days mean before the date.
export type DueRule = { anchor: "contract" | "closing"; dueDays: number };

export type TaskTemplate = {
  title: string;
  due?: DueRule | null;
  // Marks a task the app can tick off itself, e.g. "welcome-email".
  key?: string;
  category?: string;
};

export type DocumentTemplate = {
  name: string;
  required: boolean;
  due?: DueRule | null;
};

export type ChecklistTemplate = {
  tasks: TaskTemplate[];
  documents: DocumentTemplate[];
};

export type ChecklistTemplates = Record<TransactionType, ChecklistTemplate>;

export type EmailTemplate = { subject: string; body: string };

export type EmailTemplateKey =
  | "welcomeClient"
  | "welcomeAgent"
  | "followUpClientLate"
  | "followUpClientUpcoming"
  | "followUpAgent";

export type EmailTemplates = Record<EmailTemplateKey, EmailTemplate>;

export type UserTemplates = {
  checklists: ChecklistTemplates;
  emails: EmailTemplates;
};
