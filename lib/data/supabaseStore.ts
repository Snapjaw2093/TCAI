import { supabase } from "@/lib/supabase";
import type { DataStore } from "@/lib/data/store";
import { makeSampleData } from "@/lib/data/seed";
import type { Db } from "@/lib/data/localStore";
import {
  defaultSettings,
  type DocumentItem,
  type EmailDraft,
  type Person,
  type Settings,
  type Task,
  type Transaction,
} from "@/lib/types";

// The cloud version of the "front desk": same functions as the browser
// version, but records live in Supabase. Table and column names there use
// snake_case (property_address); the app uses camelCase (propertyAddress),
// so each record type has a pair of small converters below.

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

// Throws a readable error if a request failed.
function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

type Row = Record<string, string | number | boolean | null>;

const str = (v: unknown) => (v == null ? "" : String(v));
const nullable = (v: unknown) => (v == null ? null : String(v));

const personFromRow = (r: Row): Person => ({
  id: str(r.id),
  name: str(r.name),
  email: str(r.email),
  phone: str(r.phone),
  role: r.role as Person["role"],
});
const personToRow = (p: Omit<Person, "id">) => ({
  name: p.name,
  email: p.email,
  phone: p.phone,
  role: p.role,
});

const transactionFromRow = (r: Row): Transaction => ({
  id: str(r.id),
  type: r.type as Transaction["type"],
  status: r.status as Transaction["status"],
  propertyAddress: str(r.property_address),
  clientId: str(r.client_id),
  agentId: str(r.agent_id),
  contractDate: nullable(r.contract_date),
  closingDate: nullable(r.closing_date),
  price: r.price == null ? null : Number(r.price),
  notes: str(r.notes),
  createdAt: str(r.created_at),
});
const transactionToRow = (t: Omit<Transaction, "id">) => ({
  type: t.type,
  status: t.status,
  property_address: t.propertyAddress,
  client_id: t.clientId,
  agent_id: t.agentId,
  contract_date: t.contractDate,
  closing_date: t.closingDate,
  price: t.price,
  notes: t.notes,
  created_at: t.createdAt,
});

const taskFromRow = (r: Row): Task => ({
  id: str(r.id),
  transactionId: str(r.transaction_id),
  title: str(r.title),
  dueDate: nullable(r.due_date),
  status: r.status as Task["status"],
  key: r.key == null ? undefined : str(r.key),
});
const taskToRow = (t: Omit<Task, "id">) => ({
  transaction_id: t.transactionId,
  title: t.title,
  due_date: t.dueDate,
  status: t.status,
  key: t.key ?? null,
});

const documentFromRow = (r: Row): DocumentItem => ({
  id: str(r.id),
  transactionId: str(r.transaction_id),
  name: str(r.name),
  required: Boolean(r.required),
  status: r.status as DocumentItem["status"],
  dueDate: nullable(r.due_date),
});
const documentToRow = (d: Omit<DocumentItem, "id">) => ({
  transaction_id: d.transactionId,
  name: d.name,
  required: d.required,
  status: d.status,
  due_date: d.dueDate,
});

const draftFromRow = (r: Row): EmailDraft => ({
  id: str(r.id),
  transactionId: str(r.transaction_id),
  recipientId: str(r.recipient_id),
  kind: r.kind as EmailDraft["kind"],
  subject: str(r.subject),
  body: str(r.body),
  status: r.status as EmailDraft["status"],
  createdAt: str(r.created_at),
  sentAt: nullable(r.sent_at),
});
const draftToRow = (d: Omit<EmailDraft, "id">) => ({
  transaction_id: d.transactionId,
  recipient_id: d.recipientId,
  kind: d.kind,
  subject: d.subject,
  body: d.body,
  status: d.status,
  created_at: d.createdAt,
  sent_at: d.sentAt,
});

// Reads every row of a table (optionally only one deal's rows).
async function list<T>(
  table: string,
  fromRow: (r: Row) => T,
  orderBy: string,
  transactionId?: string,
): Promise<T[]> {
  let query = client().from(table).select("*").order(orderBy);
  if (transactionId) query = query.eq("transaction_id", transactionId);
  return (check(await query) as Row[]).map(fromRow);
}

// Saves a record: updates it if it has an id, otherwise adds it as new.
async function save<T extends { id: string }>(
  table: string,
  record: T | Omit<T, "id">,
  toRow: (r: Omit<T, "id">) => object,
  fromRow: (r: Row) => T,
): Promise<T> {
  const row = { ...toRow(record as Omit<T, "id">), ...("id" in record ? { id: record.id } : {}) };
  const data = check(await client().from(table).upsert(row).select().single());
  return fromRow(data as Row);
}

// Adds a whole set of records (e.g. saved browser data or the samples).
// Old ids are swapped for fresh ones, and links between records follow.
export async function importDatabase(source: Db) {
  const c = client();
  const ids = new Map<string, string>();
  const fresh = (oldId: string) => {
    const id = crypto.randomUUID();
    ids.set(oldId, id);
    return id;
  };
  const link = (oldId: string) => ids.get(oldId) ?? oldId;

  const people = source.people.map((p) => ({ id: fresh(p.id), ...personToRow(p) }));
  if (people.length) check(await c.from("people").insert(people));

  const transactions = source.transactions.map((t) => ({
    id: fresh(t.id),
    ...transactionToRow({ ...t, clientId: link(t.clientId), agentId: link(t.agentId) }),
  }));
  if (transactions.length) check(await c.from("transactions").insert(transactions));

  const tasks = source.tasks.map((t) => taskToRow({ ...t, transactionId: link(t.transactionId) }));
  if (tasks.length) check(await c.from("tasks").insert(tasks));

  const documents = source.documents.map((d) =>
    documentToRow({ ...d, transactionId: link(d.transactionId) }),
  );
  if (documents.length) check(await c.from("documents").insert(documents));

  const drafts = source.drafts.map((d) =>
    draftToRow({ ...d, transactionId: link(d.transactionId), recipientId: link(d.recipientId) }),
  );
  if (drafts.length) check(await c.from("email_drafts").insert(drafts));
}

export const supabaseStore: DataStore = {
  listTransactions: () => list("transactions", transactionFromRow, "created_at"),
  async getTransaction(id) {
    const data = check(await client().from("transactions").select("*").eq("id", id).maybeSingle());
    return data ? transactionFromRow(data as Row) : null;
  },
  saveTransaction: (t) => save("transactions", t, transactionToRow, transactionFromRow),

  listPeople: () => list("people", personFromRow, "name"),
  savePerson: (p) => save("people", p, personToRow, personFromRow),

  listTasks: (transactionId) => list("tasks", taskFromRow, "due_date", transactionId),
  saveTask: (t) => save("tasks", t, taskToRow, taskFromRow),

  listDocuments: (transactionId) => list("documents", documentFromRow, "due_date", transactionId),
  saveDocument: (d) => save("documents", d, documentToRow, documentFromRow),

  listDrafts: (transactionId) => list("email_drafts", draftFromRow, "created_at", transactionId),
  saveDraft: (d) => save("email_drafts", d, draftToRow, draftFromRow),
  async deleteDraft(id) {
    check(await client().from("email_drafts").delete().eq("id", id));
  },

  async getSettings(): Promise<Settings> {
    const data = check(await client().from("settings").select("*").maybeSingle()) as Row | null;
    if (!data) return defaultSettings;
    return { name: str(data.name), title: str(data.title), company: str(data.company) };
  },
  // One settings row per account: update it if it exists, otherwise add it.
  async saveSettings(settings) {
    const c = client();
    const existing = check(await c.from("settings").select("user_id").maybeSingle()) as Row | null;
    if (existing) {
      check(await c.from("settings").update(settings).eq("user_id", String(existing.user_id)));
    } else {
      check(await c.from("settings").insert(settings));
    }
  },

  // Deletes everything this account has, then adds the two sample deals.
  // Your signature is kept. Deals go first (they cascade to tasks, documents
  // and drafts), then the people they pointed at.
  async resetToSampleData() {
    const c = client();
    check(await c.from("transactions").delete().not("id", "is", null));
    check(await c.from("people").delete().not("id", "is", null));
    await importDatabase(makeSampleData() as Db);
  },
};
