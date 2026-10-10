import { addDays, format } from "date-fns";
import { buildChecklist } from "@/lib/templates/checklists";
import {
  defaultSettings,
  type DocumentItem,
  type Person,
  type Settings,
  type Task,
  type Transaction,
} from "@/lib/types";

// Sample deals so the app isn't empty on first launch.
// Dates are relative to today so deadlines always look realistic.

export type Database = {
  transactions: Transaction[];
  people: Person[];
  tasks: Task[];
  documents: DocumentItem[];
  drafts: never[];
  settings: Settings;
};

const day = (offset: number) => format(addDays(new Date(), offset), "yyyy-MM-dd");

export function makeSampleData(): Database {
  const people: Person[] = [
    { id: "p1", name: "Maria Lopez", email: "maria@example.com", phone: "555-0101", role: "client" },
    { id: "p2", name: "James Carter", email: "james@example.com", phone: "555-0102", role: "client" },
    { id: "p3", name: "Dana Whitfield", email: "dana@examplerealty.com", phone: "555-0199", role: "agent" },
  ];

  const transactions: Transaction[] = [
    {
      id: "t1",
      type: "buyer",
      status: "active",
      propertyAddress: "42 Maple Street",
      clientId: "p1",
      agentId: "p3",
      contractDate: day(-4),
      closingDate: day(26),
      price: 425000,
      notes: "First-time buyer. Prefers email over phone.",
      createdAt: day(-4),
    },
    {
      id: "t2",
      type: "seller",
      status: "pending",
      propertyAddress: "18 Harbor Lane",
      clientId: "p2",
      agentId: "p3",
      contractDate: day(-12),
      closingDate: day(18),
      price: 610000,
      notes: "Buyer requested repairs after inspection.",
      createdAt: day(-12),
    },
  ];

  const tasks: Task[] = [];
  const documents: DocumentItem[] = [];
  for (const t of transactions) {
    const list = buildChecklist(t.type, t.contractDate, t.closingDate);
    list.tasks.forEach((x, i) =>
      tasks.push({ ...x, id: `${t.id}-task-${i}`, transactionId: t.id }),
    );
    list.documents.forEach((x, i) =>
      documents.push({ ...x, id: `${t.id}-doc-${i}`, transactionId: t.id }),
    );
  }

  return { transactions, people, tasks, documents, drafts: [], settings: defaultSettings };
}
