import type { DocumentItem, EmailDraft, Person, Task, Transaction } from "@/lib/types";

// Works out how far along a new deal's onboarding is. Like the follow-ups list,
// nothing is stored: it is recalculated from the deal's own records.

export type MissingInfo = {
  field: "contractDate" | "closingDate" | "price" | "clientPhone" | "agentPhone";
  label: string;
  // Dates drive every deadline, so a missing one blocks onboarding from being "done".
  important: boolean;
};

export function missingInfo(
  transaction: Transaction,
  client: Person | undefined,
  agent: Person | undefined,
): MissingInfo[] {
  const missing: MissingInfo[] = [];
  if (!transaction.contractDate) missing.push({ field: "contractDate", label: "Contract date", important: true });
  if (!transaction.closingDate) missing.push({ field: "closingDate", label: "Closing date", important: true });
  if (transaction.price == null) missing.push({ field: "price", label: "Price", important: false });
  if (!client?.phone.trim()) missing.push({ field: "clientPhone", label: "Client phone", important: false });
  if (!agent?.phone.trim()) missing.push({ field: "agentPhone", label: "Agent phone", important: false });
  return missing;
}

export type OnboardingStatus = {
  transaction: Transaction;
  client: Person | undefined;
  agent: Person | undefined;
  tasks: Task[];
  tasksDone: number;
  checklistReady: boolean;
  welcome: "none" | "drafted" | "sent";
  welcomeDrafts: EmailDraft[];
  missing: MissingInfo[];
  complete: boolean;
};

export function onboardingFor(
  transaction: Transaction,
  data: { people: Person[]; tasks: Task[]; documents: DocumentItem[]; drafts: EmailDraft[] },
): OnboardingStatus {
  const client = data.people.find((p) => p.id === transaction.clientId);
  const agent = data.people.find((p) => p.id === transaction.agentId);
  const tasks = data.tasks.filter((t) => t.transactionId === transaction.id);
  const welcomeDrafts = data.drafts.filter((d) => d.transactionId === transaction.id && d.kind === "welcome");

  const welcomeTaskDone = tasks.some((t) => t.key === "welcome-email" && t.status === "done");
  const welcome = welcomeDrafts.some((d) => d.status === "sent") || welcomeTaskDone
    ? "sent"
    : welcomeDrafts.length > 0
      ? "drafted"
      : "none";

  const missing = missingInfo(transaction, client, agent);
  const checklistReady = tasks.length > 0;
  return {
    transaction,
    client,
    agent,
    tasks,
    tasksDone: tasks.filter((t) => t.status !== "open").length,
    checklistReady,
    welcome,
    welcomeDrafts,
    missing,
    complete: checklistReady && welcome === "sent" && !missing.some((m) => m.important),
  };
}

// Active or pending, not archived, and not finished onboarding.
export function needsOnboarding(status: OnboardingStatus): boolean {
  const t = status.transaction;
  return !t.archived && (t.status === "active" || t.status === "pending") && !status.complete;
}
