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
};

export type Task = {
  id: string;
  transactionId: string;
  title: string;
  dueDate: string | null;
  status: "open" | "done" | "skipped";
  // Set on tasks the app knows how to complete itself, e.g. "welcome-email".
  key?: string;
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
  recipientId: string;
  kind: "welcome" | "follow-up";
  subject: string;
  body: string;
  status: "draft" | "approved" | "sent";
  createdAt: string;
  sentAt: string | null;
};

// Who is writing the emails. Used for the signature at the bottom of each draft.
export type Settings = {
  name: string;
  title: string;
  company: string;
};

export const defaultSettings: Settings = {
  name: "",
  title: "Transaction Coordinator",
  company: "",
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
