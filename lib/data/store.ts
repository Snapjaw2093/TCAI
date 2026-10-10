import type {
  DocumentItem,
  EmailDraft,
  Person,
  Task,
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

  listDrafts(transactionId?: string): Promise<EmailDraft[]>;
  saveDraft(d: EmailDraft | NewRecord<EmailDraft>): Promise<EmailDraft>;
  deleteDraft(id: string): Promise<void>;

  resetToSampleData(): Promise<void>;
}
