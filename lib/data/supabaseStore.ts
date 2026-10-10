import { supabase } from "@/lib/supabase";
import type { DataStore } from "@/lib/data/store";
import { makeSampleData } from "@/lib/data/seed";
import { buildPath, FILES_BUCKET, validateUpload } from "@/lib/data/files";
import { requiredSchemaVersion } from "@/lib/schemaUpdateSql";
import { withDefaults } from "@/lib/templates";
import type { Db } from "@/lib/data/localStore";
import {
  defaultSettings,
  type DocumentFile,
  type DocumentItem,
  type EmailDraft,
  type Person,
  type Settings,
  type Task,
  type Transaction,
  type UserTemplates,
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
  if (result.error) throw new Error(result.error.message || "The request to the database failed.");
  return result.data;
}

type Row = Record<string, string | number | boolean | object | null>;

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
  archived: Boolean(r.archived),
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
  archived: t.archived,
});

const taskFromRow = (r: Row): Task => ({
  id: str(r.id),
  transactionId: str(r.transaction_id),
  title: str(r.title),
  dueDate: nullable(r.due_date),
  status: r.status as Task["status"],
  key: r.key == null ? undefined : str(r.key),
  category: r.category == null ? undefined : str(r.category),
});
const taskToRow = (t: Omit<Task, "id">) => ({
  transaction_id: t.transactionId,
  title: t.title,
  due_date: t.dueDate,
  status: t.status,
  key: t.key ?? null,
  category: t.category ?? null,
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

const fileFromRow = (r: Row): DocumentFile => ({
  id: str(r.id),
  transactionId: str(r.transaction_id),
  documentId: nullable(r.document_id),
  fileName: str(r.file_name),
  mimeType: str(r.mime_type),
  sizeBytes: Number(r.size_bytes),
  createdAt: str(r.created_at),
});

const draftFromRow = (r: Row): EmailDraft => ({
  id: str(r.id),
  transactionId: str(r.transaction_id),
  recipientId: str(r.recipient_id),
  recipientEmail: str(r.recipient_email),
  kind: r.kind as EmailDraft["kind"],
  subject: str(r.subject),
  body: str(r.body),
  status: r.status as EmailDraft["status"],
  createdAt: str(r.created_at),
  sentAt: nullable(r.sent_at),
  aiInfo: (r.ai_info as unknown as EmailDraft["aiInfo"]) ?? null,
});
const draftToRow = (d: Omit<EmailDraft, "id">) => ({
  transaction_id: d.transactionId,
  recipient_id: d.recipientId || null, // empty = someone who isn't in the deal
  recipient_email: d.recipientEmail,
  kind: d.kind,
  subject: d.subject,
  body: d.body,
  status: d.status,
  created_at: d.createdAt,
  sent_at: d.sentAt,
  ai_info: d.aiInfo ?? null,
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
    ...transactionToRow({
      ...t,
      archived: t.archived ?? false,
      clientId: link(t.clientId),
      agentId: link(t.agentId),
    }),
  }));
  if (transactions.length) check(await c.from("transactions").insert(transactions));

  const tasks = source.tasks.map((t) => taskToRow({ ...t, transactionId: link(t.transactionId) }));
  if (tasks.length) check(await c.from("tasks").insert(tasks));

  const documents = source.documents.map((d) =>
    documentToRow({ ...d, transactionId: link(d.transactionId) }),
  );
  if (documents.length) check(await c.from("documents").insert(documents));

  const drafts = source.drafts.map((d) =>
    draftToRow({
      ...d,
      recipientEmail: d.recipientEmail ?? "",
      transactionId: link(d.transactionId),
      recipientId: link(d.recipientId),
    }),
  );
  if (drafts.length) check(await c.from("email_drafts").insert(drafts));
}

export const supabaseStore: DataStore = {
  filesSupported: true,

  async listFiles(transactionId) {
    let q = client().from("document_files").select("*").order("created_at", { ascending: false });
    if (transactionId) q = q.eq("transaction_id", transactionId);
    return (check(await q) as Row[]).map(fileFromRow);
  },

  // Stores the file, then records it. If recording fails the file is removed again,
  // so nothing is left behind that the app can't see.
  async uploadFile(transactionId, documentId, file) {
    const c = client();
    const checked = validateUpload(file);
    const { data: auth } = await c.auth.getUser();
    if (!auth.user) throw new Error("Please log in again.");
    const path = buildPath(auth.user.id, transactionId, file.name);

    const up = await c.storage.from(FILES_BUCKET).upload(path, file, { contentType: checked.type, upsert: false });
    if (up.error) throw new Error(up.error.message || "The upload failed.");

    const row = await c
      .from("document_files")
      .insert({
        transaction_id: transactionId,
        document_id: documentId,
        file_name: checked.name,
        mime_type: checked.type,
        size_bytes: file.size,
        storage_path: path,
      })
      .select()
      .single();
    if (row.error) {
      await c.storage.from(FILES_BUCKET).remove([path]);
      throw new Error(row.error.message || "The file was uploaded but couldn't be saved.");
    }
    return fileFromRow(row.data as Row);
  },

  // Removes the stored file first. Only if that works is the record deleted.
  async deleteFile(id) {
    const c = client();
    const found = check(await c.from("document_files").select("storage_path").eq("id", id).maybeSingle()) as Row | null;
    if (!found) return;
    const gone = await c.storage.from(FILES_BUCKET).remove([str(found.storage_path)]);
    if (gone.error) throw new Error(gone.error.message || "The file couldn't be removed.");
    check(await c.from("document_files").delete().eq("id", id));
  },

  // A link that expires after a minute and forces a download, so a file can never open as a web page.
  async fileUrl(id) {
    const c = client();
    const found = check(await c.from("document_files").select("storage_path, file_name").eq("id", id).maybeSingle()) as Row | null;
    if (!found) throw new Error("That file no longer exists.");
    const signed = await c.storage.from(FILES_BUCKET).createSignedUrl(str(found.storage_path), 60, { download: str(found.file_name) });
    if (signed.error || !signed.data) throw new Error(signed.error?.message || "Couldn't open the file.");
    return signed.data.signedUrl;
  },

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

  async listDrafts(transactionId) {
    const drafts = await list("email_drafts", draftFromRow, "created_at", transactionId);
    // Drafts made before editable recipients have no address saved yet.
    if (drafts.every((d) => d.recipientEmail)) return drafts;
    const people = await list("people", personFromRow, "name");
    return drafts.map((d) => ({
      ...d,
      recipientEmail: d.recipientEmail || people.find((p) => p.id === d.recipientId)?.email || "",
    }));
  },
  saveDraft: (d) => save("email_drafts", d, draftToRow, draftFromRow),
  async deleteDraft(id) {
    check(await client().from("email_drafts").delete().eq("id", id));
  },

  async getSettings(): Promise<Settings> {
    const data = check(await client().from("settings").select("*").maybeSingle()) as
      | (Row & { task_categories?: unknown })
      | null;
    if (!data) return defaultSettings;
    const categories = Array.isArray(data.task_categories)
      ? data.task_categories.filter((c): c is string => typeof c === "string")
      : [];
    return {
      name: str(data.name),
      title: str(data.title),
      company: str(data.company),
      defaultTransactionType: data.default_transaction_type === "seller" ? "seller" : "buyer",
      followUpDays: Number(data.follow_up_days) || defaultSettings.followUpDays,
      taskCategories: categories.length ? categories : defaultSettings.taskCategories,
    };
  },
  // One settings row per account: update it if it exists, otherwise add it.
  async saveSettings(settings) {
    const c = client();
    const row = {
      name: settings.name,
      title: settings.title,
      company: settings.company,
      default_transaction_type: settings.defaultTransactionType,
      follow_up_days: settings.followUpDays,
      task_categories: settings.taskCategories,
    };
    const existing = check(await c.from("settings").select("user_id").maybeSingle()) as Row | null;
    if (existing) {
      check(await c.from("settings").update(row).eq("user_id", String(existing.user_id)));
    } else {
      check(await c.from("settings").insert(row));
    }
  },

  // Templates are stored as one row of JSON per account. If the table isn't
  // there yet (the SQL hasn't been re-run), the built-in templates are used so
  // the rest of the app keeps working; only saving reports the problem.
  async getTemplates() {
    const result = await client().from("templates").select("*").maybeSingle();
    if (result.error || !result.data) return withDefaults(null);
    return withDefaults(result.data as unknown as Partial<UserTemplates>);
  },
  async saveTemplates(templates) {
    const c = client();
    const existing = check(await c.from("templates").select("user_id").maybeSingle()) as Row | null;
    if (existing) {
      check(await c.from("templates").update(templates).eq("user_id", String(existing.user_id)));
    } else {
      check(await c.from("templates").insert(templates));
    }
  },

  // Looks for the columns and tables added over time. A missing one means
  // supabase/schema.sql needs re-running (it is safe to run again).
  async checkSchema() {
    const probes: [string, string][] = [
      ["transactions", "archived"],
      ["tasks", "category"],
      ["email_drafts", "recipient_email"],
      ["email_drafts", "ai_info"],
      ["settings", "default_transaction_type"],
      ["settings", "follow_up_days"],
      ["settings", "task_categories"],
      ["templates", "user_id"],
      ["document_files", "storage_path"],
    ];
    const c = client();
    const results = await Promise.all(
      probes.map(([table, column]) => c.from(table).select(column).limit(1)),
    );
    const missing: string[] = [];
    results.forEach((r, i) => {
      if (!r.error) return;
      // Only "doesn't exist" errors count; anything else (network, login) is a real error.
      if (/does not exist|could not find|schema cache/i.test(r.error.message)) {
        missing.push(`${probes[i][0]}.${probes[i][1]}`);
      } else {
        throw new Error(r.error.message || "Could not reach the database.");
      }
    });
    // The version marker says whether the security migrations have been run.
    const v = await c.from("app_schema_version").select("version").order("version", { ascending: false }).limit(1);
    if (v.error) {
      if (/does not exist|could not find|schema cache/i.test(v.error.message)) missing.push("security update");
      else throw new Error(v.error.message || "Could not reach the database.");
    } else if (Number(v.data?.[0]?.version ?? 0) < requiredSchemaVersion) {
      missing.push("security update");
    }
    return missing;
  },

  // Deletes everything this account has, then adds the two sample deals.
  // Your signature is kept. Deals go first (they cascade to tasks, documents
  // and drafts), then the people they pointed at.
  async resetToSampleData() {
    const c = client();
    // Stored files are not removed by deleting their deal, so take them out first.
    const files = check(await c.from("document_files").select("storage_path")) as Row[];
    for (let i = 0; i < files.length; i += 100) {
      const gone = await c.storage.from(FILES_BUCKET).remove(files.slice(i, i + 100).map((f) => str(f.storage_path)));
      if (gone.error) throw new Error(gone.error.message || "Couldn't remove the stored files.");
    }
    check(await c.from("transactions").delete().not("id", "is", null));
    check(await c.from("people").delete().not("id", "is", null));
    await importDatabase(makeSampleData() as Db);
  },
};
