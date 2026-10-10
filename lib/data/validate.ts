import type { DataStore } from "@/lib/data/store";
import type { DocumentItem, EmailDraft, Person, Settings, Task, Transaction } from "@/lib/types";

// Checks a record before it is saved, so people get a plain-English message
// instead of a database error. The same limits are enforced again by the
// database itself (supabase/migrations/0002_security_hardening.sql), which is
// what actually protects the data: this layer is only the friendly one.

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export const limits = {
  name: 200,
  phone: 50,
  email: 320,
  address: 300,
  notes: 10_000,
  title: 300,
  category: 100,
  subject: 500,
  body: 40_000,
  setting: 200,
  maxPrice: 1_000_000_000_000,
} as const;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(label: string, value: unknown, max: number, { required = false } = {}) {
  if (typeof value !== "string") throw new ValidationError(`${label} must be text.`);
  if (required && value.trim() === "") throw new ValidationError(`${label} is required.`);
  if (value.length > max) throw new ValidationError(`${label} is too long (the limit is ${max.toLocaleString()} characters).`);
}

function email(label: string, value: unknown) {
  text(label, value, limits.email);
  if (value !== "" && !EMAIL.test(value as string)) throw new ValidationError(`${label} doesn't look like an email address.`);
}

function date(label: string, value: unknown) {
  if (value == null || value === "") return;
  const d = typeof value === "string" && DATE.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw new ValidationError(`${label} isn't a valid date.`);
  }
}

function oneOf(label: string, value: unknown, allowed: readonly string[]) {
  if (typeof value !== "string" || !allowed.includes(value)) throw new ValidationError(`${label} isn't one of the allowed choices.`);
}

export function validatePerson<T extends Omit<Person, "id">>(p: T): T {
  text("Name", p.name, limits.name, { required: true });
  email("Email address", p.email);
  text("Phone number", p.phone, limits.phone);
  oneOf("Role", p.role, ["client", "agent"]);
  return p;
}

export function validateTransaction<T extends Omit<Transaction, "id">>(t: T): T {
  text("Property address", t.propertyAddress, limits.address, { required: true });
  text("Notes", t.notes, limits.notes);
  oneOf("Type", t.type, ["buyer", "seller"]);
  oneOf("Status", t.status, ["active", "pending", "closed", "cancelled"]);
  date("Contract date", t.contractDate);
  date("Closing date", t.closingDate);
  if (t.price != null && (!Number.isFinite(t.price) || t.price < 0 || t.price >= limits.maxPrice)) {
    throw new ValidationError("Price must be a positive number.");
  }
  if (!t.clientId || !t.agentId) throw new ValidationError("A deal needs a client and an agent.");
  return t;
}

export function validateTask<T extends Omit<Task, "id">>(t: T): T {
  text("Task title", t.title, limits.title, { required: true });
  if (t.category != null) text("Category", t.category, limits.category);
  date("Due date", t.dueDate);
  oneOf("Status", t.status, ["open", "done", "skipped"]);
  if (!t.transactionId) throw new ValidationError("A task needs a deal.");
  return t;
}

export function validateDocument<T extends Omit<DocumentItem, "id">>(d: T): T {
  text("Document name", d.name, limits.title, { required: true });
  date("Due date", d.dueDate);
  oneOf("Status", d.status, ["needed", "requested", "received"]);
  if (!d.transactionId) throw new ValidationError("A document needs a deal.");
  return d;
}

export function validateDraft<T extends Omit<EmailDraft, "id">>(d: T): T {
  text("Subject", d.subject, limits.subject);
  text("Message", d.body, limits.body);
  if (d.recipientEmail) email("Recipient email", d.recipientEmail);
  oneOf("Status", d.status, ["draft", "approved", "sent"]);
  if (!d.transactionId) throw new ValidationError("An email needs a deal.");
  return d;
}

export function validateSettings(s: Settings): Settings {
  text("Name", s.name, limits.setting);
  text("Title", s.title, limits.setting);
  text("Company", s.company, limits.setting);
  if (!Number.isInteger(s.followUpDays) || s.followUpDays < 1 || s.followUpDays > 365) {
    throw new ValidationError("The follow-up window must be between 1 and 365 days.");
  }
  return s;
}

// Wraps a store so every save is checked first. Everything else passes straight through.
export function withValidation(store: DataStore): DataStore {
  return {
    ...store,
    saveTransaction: async (t) => store.saveTransaction(validateTransaction(t)),
    savePerson: async (p) => store.savePerson(validatePerson(p)),
    saveTask: async (t) => store.saveTask(validateTask(t)),
    saveDocument: async (d) => store.saveDocument(validateDocument(d)),
    saveDraft: async (d) => store.saveDraft(validateDraft(d)),
    saveSettings: async (s) => store.saveSettings(validateSettings(s)),
  };
}
