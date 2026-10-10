import { db } from "@/lib/data";
import { buildChecklist } from "@/lib/templates/checklists";
import type { Transaction } from "@/lib/types";

// Fills a transaction with its tasks and required documents from the
// templates, using the deal's own dates for the due dates.
export async function applyTemplate(transaction: Transaction) {
  const list = buildChecklist(
    transaction.type,
    transaction.contractDate,
    transaction.closingDate,
  );
  const tasks = await Promise.all(
    list.tasks.map((t) => db.saveTask({ ...t, transactionId: transaction.id })),
  );
  const documents = await Promise.all(
    list.documents.map((d) => db.saveDocument({ ...d, transactionId: transaction.id })),
  );
  return { tasks, documents };
}
