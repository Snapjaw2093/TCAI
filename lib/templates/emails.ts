import { dueLabel, formatDate } from "@/lib/format";
import type { FollowUpItem } from "@/lib/followups";
import type { DocumentItem, Person, Settings, Transaction } from "@/lib/types";

// Email wording lives here as plain text with blanks filled from the deal.
// To change how the emails read, edit the sentences below.

const firstName = (person: Person) => person.name.split(" ")[0];

const defaultSignature = "Best regards,\n[Your name]\nTransaction Coordinator";

export function buildSignature(settings: Settings): string {
  return (
    `Best regards,\n${settings.name.trim() || "[Your name]"}` +
    `${settings.title.trim() ? `\n${settings.title.trim()}` : ""}` +
    `${settings.company.trim() ? `\n${settings.company.trim()}` : ""}`
  );
}

function keyDates(t: Transaction): string {
  const lines = [];
  if (t.contractDate) lines.push(`- Contract date: ${formatDate(t.contractDate)}`);
  if (t.closingDate) lines.push(`- Closing date: ${formatDate(t.closingDate)}`);
  return lines.length ? `Key dates\n${lines.join("\n")}\n\n` : "";
}

function neededDocuments(documents: DocumentItem[], intro: string): string {
  const needed = documents.filter((d) => d.required && d.status === "needed");
  if (needed.length === 0) return "";
  const lines = needed.map(
    (d) => `- ${d.name}${d.dueDate ? ` (by ${formatDate(d.dueDate)})` : ""}`,
  );
  return `${intro}\n${lines.join("\n")}\n\n`;
}

export type DraftContent = { subject: string; body: string };

export function buildWelcomeEmail(
  recipient: Person,
  transaction: Transaction,
  client: Person,
  agent: Person,
  documents: DocumentItem[],
  signature: string = defaultSignature,
): DraftContent {
  const t = transaction;
  const buying = t.type === "buyer";
  const subject = `Welcome! Next steps for ${t.propertyAddress}`;

  if (recipient.role === "agent") {
    const side = buying ? "buyer" : "seller";
    const body =
      `Hi ${firstName(agent)},\n\n` +
      `I'm getting started on ${t.propertyAddress} (${side} side, client: ${client.name}) ` +
      `and wanted to share what I have so far.\n\n` +
      keyDates(t) +
      neededDocuments(documents, "Documents I'm tracking") +
      `Please let me know if anything is missing or if there's anything special I should watch for. ` +
      `I'll keep you posted as items come in.\n\n` +
      signature;
    return { subject, body };
  }

  const body =
    `Hi ${firstName(client)},\n\n` +
    `Welcome! I'm the transaction coordinator working with ${agent.name}, ` +
    `and I'll be helping keep ${buying ? "your purchase of" : "the sale of"} ` +
    `${t.propertyAddress} on track from here to closing.\n\n` +
    keyDates(t) +
    neededDocuments(documents, "To get started, we'll be gathering:") +
    `You'll hear from me whenever something needs your attention. ` +
    `In the meantime, feel free to reply to this email with any questions.\n\n` +
    signature;
  return { subject, body };
}

const itemLine = (item: FollowUpItem) =>
  `- ${item.title} (${formatDate(item.dueDate)}, ${dueLabel(item.daysUntil)})`;

function section(heading: string, items: FollowUpItem[]): string {
  return items.length ? `${heading}\n${items.map(itemLine).join("\n")}\n\n` : "";
}

export function buildFollowUpEmail(
  recipient: Person,
  transaction: Transaction,
  client: Person,
  agent: Person,
  items: FollowUpItem[],
  signature: string = defaultSignature,
): DraftContent {
  const t = transaction;
  const documents = items.filter((i) => i.kind === "document");
  const tasks = items.filter((i) => i.kind === "task");
  const closing = items.find((i) => i.kind === "closing");
  const anyLate = items.some((i) => i.daysUntil < 0 && i.kind !== "closing");
  const closingLine = closing
    ? `A reminder that closing is ${
        closing.daysUntil < 0
          ? `scheduled for ${formatDate(closing.dueDate)}`
          : `${formatDate(closing.dueDate)} (${dueLabel(closing.daysUntil).replace("due ", "")})`
      }.\n\n`
    : "";

  if (recipient.role === "agent") {
    const body =
      `Hi ${firstName(agent)},\n\n` +
      `Here's where ${t.propertyAddress} (client: ${client.name}) stands:\n\n` +
      section("Documents outstanding", documents) +
      section("Tasks needing attention", tasks) +
      closingLine +
      `Let me know if you can help move anything along or if anything has changed on your end.\n\n` +
      signature;
    return { subject: `Status update: ${t.propertyAddress}`, body };
  }

  const body =
    `Hi ${firstName(client)},\n\n` +
    (anyLate
      ? `I'm following up on a few items for ${t.propertyAddress} that are now past due.\n\n`
      : `A quick note on what's coming up for ${t.propertyAddress}.\n\n`) +
    section("What we still need from you", documents) +
    closingLine +
    `If you've already sent any of these, just let me know and I'll update my records. ` +
    `Happy to answer any questions.\n\n` +
    signature;
  return {
    subject: anyLate
      ? `Follow-up: items needed for ${t.propertyAddress}`
      : `Heads-up: upcoming items for ${t.propertyAddress}`,
    body,
  };
}
