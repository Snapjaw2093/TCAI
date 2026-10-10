import { format } from "date-fns";
import { findFollowUps, type FollowUpItem } from "@/lib/followups";
import { dueLabel, formatDate } from "@/lib/format";
import { requiredProblems } from "@/lib/ai/rules";
import {
  roleInfo,
  type AiDraftType,
  type AiFact,
  type AiRecipientRole,
} from "@/lib/ai/types";
import type { DocumentItem, Person, Task, Transaction } from "@/lib/types";

// Decides what the AI is told about a deal, and nothing more.
//
// DELIBERATELY NEVER SENT: phone numbers, email addresses, the price, your
// private notes on the deal, and internal record ids. Names, the property
// address, and the specific items you choose are all it gets.

export type Include = { dates: boolean; documents: boolean; openTasks: boolean; completedTasks: boolean };

export type FactInputs = {
  draftType: AiDraftType;
  recipientRole: AiRecipientRole;
  recipientName: string; // typed in, for lender / title / someone else
  transaction: Transaction;
  client: Person | undefined;
  agent: Person | undefined;
  tasks: Task[];
  documents: DocumentItem[];
  include: Include;
  pickedDocumentIds: string[]; // missing-document and signature reminders
  pickedDeadlineIds: string[]; // deadline reminder (ids from deadlineCandidates)
  extraItems: string[]; // documents you typed in yourself
  instructions: string;
  confirmed: boolean;
  today?: Date;
  windowDays?: number;
};

export type FactBuild = {
  facts: AiFact[];
  recipientName: string | null;
  problems: string[];
};

// What is switched on by default for each kind of email.
export function defaultInclude(draftType: AiDraftType): Include {
  switch (draftType) {
    case "welcome":
      return { dates: true, documents: true, openTasks: false, completedTasks: false };
    case "status-update":
      return { dates: true, documents: true, openTasks: true, completedTasks: true };
    default:
      return { dates: false, documents: false, openTasks: false, completedTasks: false };
  }
}

// Dated items you can pick for a deadline reminder (overdue and coming up).
export function deadlineCandidates(
  transaction: Transaction,
  tasks: Task[],
  documents: DocumentItem[],
  today: Date = new Date(),
  windowDays = 30,
): FollowUpItem[] {
  return findFollowUps([transaction], tasks, documents, windowDays, today)[0]?.items ?? [];
}

const REASON_DATES = "Dates and deadlines are not confirmed against the contract.";
const REASON_DOCS = "Which documents are required comes from your checklist template, not the contract.";

export function buildFacts(i: FactInputs): FactBuild {
  const today = i.today ?? new Date();
  const confirmed = i.confirmed;
  const t = i.transaction;
  const facts: AiFact[] = [];
  const add = (id: string, label: string, value: string, source: string, unverified = false) => {
    facts.push({ id, label, value: value.trim(), source, unverified: unverified && !confirmed });
  };

  add("property_address", "Property address", t.propertyAddress, "Deal record");
  add("deal_side", "Our client is the", t.type === "buyer" ? "buyer" : "seller", "Deal record");
  add("today", "Today's date", formatDate(format(today, "yyyy-MM-dd")), "Your device clock");
  if (i.client) add("client_name", "Client name", i.client.name, "Deal record");
  if (i.agent) add("agent_name", "Agent name", i.agent.name, "Deal record");
  add("recipient_role", "Recipient role", roleInfo[i.recipientRole].label, "Your selection");

  // Who the email is to.
  const recipientName =
    i.recipientRole === "client"
      ? (i.client?.name ?? "")
      : i.recipientRole === "agent"
        ? (i.agent?.name ?? "")
        : i.recipientName;
  if (recipientName.trim()) {
    add(
      "recipient_name",
      "Recipient name",
      recipientName.trim(),
      i.recipientRole === "client" || i.recipientRole === "agent" ? "Deal record" : "Your input",
    );
  }

  // Contract and closing dates: unverified until you confirm them.
  if (i.include.dates) {
    if (t.contractDate) add("contract_date", "Contract date", formatDate(t.contractDate), "Deal record", true);
    if (t.closingDate) add("closing_date", "Closing date", formatDate(t.closingDate), "Deal record", true);
  }

  const outstanding = i.documents.filter((d) => d.status !== "received");
  const docLine = (d: DocumentItem) =>
    `${d.name} (${d.required ? "required by the checklist" : "optional"}; ${d.status}` +
    `${d.dueDate ? `; due ${formatDate(d.dueDate)}` : ""})`;

  // Documents you picked for a missing-document reminder.
  if (i.draftType === "missing-documents") {
    outstanding
      .filter((d) => i.pickedDocumentIds.includes(d.id))
      .forEach((d, n) => add(`doc_${n + 1}`, "Document still needed", docLine(d), "Checklist", true));
    i.extraItems.forEach((line, n) => add(`extra_doc_${n + 1}`, "Document still needed (typed by you)", line, "Your input"));
  }

  // Documents you picked for a signature reminder. We don't track signatures,
  // so this is you telling us, not something we know.
  if (i.draftType === "signature-reminder") {
    i.documents
      .filter((d) => i.pickedDocumentIds.includes(d.id))
      .forEach((d, n) => add(`sign_${n + 1}`, "Waiting for a signature (as you told us)", d.name, "Your selection"));
    i.extraItems.forEach((line, n) => add(`sign_extra_${n + 1}`, "Waiting for a signature (typed by you)", line, "Your input"));
  }

  // Dated items you picked for a deadline reminder.
  if (i.draftType === "deadline-reminder") {
    deadlineCandidates(t, i.tasks, i.documents, today, i.windowDays ?? 30)
      .filter((item) => i.pickedDeadlineIds.includes(item.id))
      .forEach((item, n) =>
        add(
          `deadline_${n + 1}`,
          item.kind === "closing" ? "Closing date" : item.kind === "document" ? "Document due" : "Task due",
          `${item.title}: ${formatDate(item.dueDate)} (${dueLabel(item.daysUntil)})`,
          "Checklist",
          true,
        ),
      );
  }

  // Optional extras you switch on.
  if (i.include.documents && i.draftType !== "missing-documents" && i.draftType !== "signature-reminder") {
    outstanding
      .slice(0, 12)
      .forEach((d, n) => add(`outdoc_${n + 1}`, "Document still needed", docLine(d), "Checklist", true));
  }
  if (i.include.openTasks && i.draftType !== "deadline-reminder") {
    i.tasks
      .filter((x) => x.status === "open")
      .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
      .slice(0, 8)
      .forEach((x, n) =>
        add(`task_${n + 1}`, "Open task", `${x.title}${x.dueDate ? ` (due ${formatDate(x.dueDate)})` : ""}`, "Checklist", !!x.dueDate),
      );
  }
  if (i.include.completedTasks) {
    i.tasks
      .filter((x) => x.status === "done")
      .slice(0, 10)
      .forEach((x, n) => add(`done_${n + 1}`, "Completed task", x.title, "Checklist"));
  }

  // A plain count, worked out here so the AI never has to guess progress.
  if (i.draftType === "status-update") {
    const done = i.tasks.filter((x) => x.status !== "open").length;
    const required = i.documents.filter((d) => d.required);
    add(
      "progress",
      "Checklist progress",
      `${done} of ${i.tasks.length} tasks done; ${required.filter((d) => d.status === "received").length} of ${required.length} required documents received`,
      "Checklist",
      true,
    );
  }

  return {
    facts,
    recipientName: recipientName.trim() || null,
    problems: requiredProblems(i.draftType, i.recipientRole, facts, i.instructions),
  };
}

// Why a fact is flagged, for the "Source information" panel.
export function unverifiedReason(fact: AiFact): string {
  if (fact.id.startsWith("doc_") || fact.id.startsWith("outdoc_")) return REASON_DOCS;
  return REASON_DATES;
}
