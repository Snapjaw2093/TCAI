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
