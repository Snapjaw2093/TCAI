import type {
  DocumentFile,
  DocumentItem,
  EmailDraft,
  Person,
  Settings,
  Task,
  UserTemplates,
  Transaction,
} from "@/lib/types";

// The "front desk". Pages only ever call these functions and never touch
// storage directly. Today the desk keeps records in the browser; later we
// swap in a Supabase version with the same functions and no page changes.
// Every function is async because a database call takes time.

export type NewRecord<T> = Omit<T, "id">;

export interface DataStore {
  listTransactions(): Promise<Transaction[]>;
  getTransaction(id: string): Promise<Transaction | null>;
  saveTransaction(t: Transaction | NewRecord<Transaction>): Promise<Transaction>;

  listPeople(): Promise<Person[]>;
  savePerson(p: Person | NewRecord<Person>): Promise<Person>;

  listTasks(transactionId?: string): Promise<Task[]>;
  saveTask(t: Task | NewRecord<Task>): Promise<Task>;

  listDocuments(transactionId?: string): Promise<DocumentItem[]>;
  saveDocument(d: DocumentItem | NewRecord<DocumentItem>): Promise<DocumentItem>;

  // Uploaded files. Only accounts (the cloud version) can store files: the
  // browser-only demo has no room for them, and says so.
  filesSupported: boolean;
  listFiles(transactionId?: string): Promise<DocumentFile[]>;
  uploadFile(transactionId: string, documentId: string | null, file: File): Promise<DocumentFile>;
  deleteFile(id: string): Promise<void>;
  // A link that works for one minute and downloads the file.
  fileUrl(id: string): Promise<string>;

  listDrafts(transactionId?: string): Promise<EmailDraft[]>;
  saveDraft(d: EmailDraft | NewRecord<EmailDraft>): Promise<EmailDraft>;
  deleteDraft(id: string): Promise<void>;

  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;

  // Your edited checklists and emails (built-in ones fill any gaps).
  getTemplates(): Promise<UserTemplates>;
  saveTemplates(templates: UserTemplates): Promise<void>;

  // Names of anything the database is missing (empty = ready). Only the
  // cloud version can be out of date.
  checkSchema(): Promise<string[]>;

  resetToSampleData(): Promise<void>;
}
