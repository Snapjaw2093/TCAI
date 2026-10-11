import type { DataStore } from "@/lib/data/store";
import { makeSampleData, type Database } from "@/lib/data/seed";
import { withDefaults } from "@/lib/templates";
import { defaultSettings, type EmailDraft, type UserTemplates } from "@/lib/types";

// The browser-storage version of the front desk.
// Everything lives in one box (a single localStorage entry).
// Only call this from client components, since servers have no localStorage.

const KEY = "tc-assistant-db-v1";

export type Db = Omit<Database, "drafts"> & {
  drafts: EmailDraft[];
  templates?: UserTemplates; // missing until you edit a template
};

function load(): Db {
  const raw = window.localStorage.getItem(KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as Db;
    } catch {
      // damaged data: fall through and start from the samples
    }
  }
  const fresh = makeSampleData();
  window.localStorage.setItem(KEY, JSON.stringify(fresh));
  return fresh as Db;
}

// Data saved by earlier versions of the app can lack newer fields.
const withArchived = <T extends { archived?: boolean }>(t: T) => ({ ...t, archived: t.archived ?? false });

function persist(db: Db) {
  window.localStorage.setItem(KEY, JSON.stringify(db));
}

// Adds an id and saves, or replaces the record that has the same id.
function upsert<T extends { id: string }>(
  list: T[],
  record: T | Omit<T, "id">,
): T {
  if ("id" in record) {
    const i = list.findIndex((x) => x.id === record.id);
    if (i >= 0) list[i] = record;
    else list.push(record);
    return record;
  }
  const created = { ...record, id: crypto.randomUUID() } as T;
  list.push(created);
  return created;
}

function forTransaction<T extends { transactionId: string }>(
  list: T[],
  transactionId?: string,
) {
  return transactionId ? list.filter((x) => x.transactionId === transactionId) : list;
}

const noFiles = () => new Error("Uploads need an account. In this browser-only demo there is nowhere safe to keep files.");

export const localStore: DataStore = {
  sendTestReminder: async () => {
    throw new Error("Reminder emails need an account.");
  },
  filesSupported: false,
  listFiles: async () => [],
  uploadFile: async () => {
    throw noFiles();
  },
  deleteFile: async () => {
    throw noFiles();
  },
  fileUrl: async () => {
    throw noFiles();
  },

  async listTransactions() {
    return load().transactions.map(withArchived);
  },
  async getTransaction(id) {
    const found = load().transactions.find((t) => t.id === id);
    return found ? withArchived(found) : null;
  },
  async saveTransaction(t) {
    const db = load();
    const saved = upsert(db.transactions, t);
    persist(db);
    return saved;
  },

  async listPeople() {
    return load().people;
  },
  async savePerson(p) {
    const db = load();
    const saved = upsert(db.people, p);
    persist(db);
    return saved;
  },

  async listTasks(transactionId) {
    return forTransaction(load().tasks, transactionId);
  },
  async saveTask(t) {
    const db = load();
    const saved = upsert(db.tasks, t);
    persist(db);
    return saved;
  },

  async listDocuments(transactionId) {
    return forTransaction(load().documents, transactionId);
  },
  async saveDocument(d) {
    const db = load();
    const saved = upsert(db.documents, d);
    persist(db);
    return saved;
  },

  async listDrafts(transactionId) {
    const db = load();
    return forTransaction(db.drafts, transactionId).map((d) => ({
      ...d,
      recipientEmail: d.recipientEmail ?? db.people.find((p) => p.id === d.recipientId)?.email ?? "",
    }));
  },
  async saveDraft(d) {
    const db = load();
    const saved = upsert(db.drafts, d);
    persist(db);
    return saved;
  },

  async deleteDraft(id) {
    const db = load();
    db.drafts = db.drafts.filter((d) => d.id !== id);
    persist(db);
  },

  async getSettings() {
    // Data saved before settings existed has no settings entry yet.
    return { ...defaultSettings, ...load().settings };
  },
  async saveSettings(settings) {
    const db = load();
    db.settings = settings;
    persist(db);
  },

  async getTemplates() {
    return withDefaults(load().templates);
  },
  async saveTemplates(templates) {
    const db = load();
    db.templates = templates;
    persist(db);
  },

  async checkSchema() {
    return [];
  },

  async resetToSampleData() {
    // Sample deals come back, but your signature and templates are kept.
    const { settings, templates } = load();
    persist({ ...makeSampleData(), settings, templates } as Db);
  },
};

// Saved browser data, or null if there is none. Used to move it to Supabase.
export function readLocalDatabase(): Db | null {
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Db;
  } catch {
    return null;
  }
}

export function clearLocalDatabase() {
  window.localStorage.removeItem(KEY);
}
