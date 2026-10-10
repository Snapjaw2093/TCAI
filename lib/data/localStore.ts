import type { DataStore } from "@/lib/data/store";
import { makeSampleData, type Database } from "@/lib/data/seed";
import { defaultSettings, type EmailDraft } from "@/lib/types";

// The browser-storage version of the front desk.
// Everything lives in one box (a single localStorage entry).
// Only call this from client components, since servers have no localStorage.

const KEY = "tc-assistant-db-v1";

type Db = Omit<Database, "drafts"> & { drafts: EmailDraft[] };

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

export const localStore: DataStore = {
  async listTransactions() {
    return load().transactions;
  },
  async getTransaction(id) {
    return load().transactions.find((t) => t.id === id) ?? null;
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
    return forTransaction(load().drafts, transactionId);
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

  async resetToSampleData() {
    // Sample deals come back, but your name and signature are kept.
    const settings = load().settings;
    persist({ ...makeSampleData(), settings } as Db);
  },
};
