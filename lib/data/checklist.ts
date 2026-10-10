import { db } from "@/lib/data";
import { buildChecklist } from "@/lib/templates/checklists";
import type { Transaction } from "@/lib/types";

// Fills a transaction with its tasks and required documents from the
// templates, using the deal's own dates for the due dates.
export async function applyTemplate(transaction: Transaction) {
  const templates = await db.getTemplates();
  const list = buildChecklist(
    transaction.type,
    transaction.contractDate,
    transaction.closingDate,
    templates.checklists,
  );
  const tasks = await Promise.all(
    list.tasks.map((t) => db.saveTask({ ...t, transactionId: transaction.id })),
  );
  const documents = await Promise.all(
    list.documents.map((d) => db.saveDocument({ ...d, transactionId: transaction.id })),
  );
  return { tasks, documents };
}

// After a deal's dates change, moves the deadlines of its template tasks and
// documents to match (and fills in any missing task categories). Finished items keep the dates they had, and anything
// you added yourself (not from the template) is left alone.
export async function recalculateDueDates(transaction: Transaction) {
  const fresh = buildChecklist(
    transaction.type,
    transaction.contractDate,
    transaction.closingDate,
    (await db.getTemplates()).checklists,
  );
  const [tasks, documents] = await Promise.all([
    db.listTasks(transaction.id),
    db.listDocuments(transaction.id),
  ]);
  for (const task of tasks) {
    const match = fresh.tasks.find((t) => t.title === task.title);
    if (!match) continue; // a task you added yourself
    const moveDate = task.status === "open" && match.dueDate !== task.dueDate;
    // Deals made before categories existed pick theirs up here.
    const addCategory = !task.category && !!match.category;
    if (moveDate || addCategory) {
      await db.saveTask({
        ...task,
        dueDate: moveDate ? match.dueDate : task.dueDate,
        category: task.category ?? match.category,
      });
    }
  }
  for (const doc of documents) {
    const match = fresh.documents.find((d) => d.name === doc.name);
    if (match && doc.status !== "received" && match.dueDate !== doc.dueDate) {
      await db.saveDocument({ ...doc, dueDate: match.dueDate });
    }
  }
}
