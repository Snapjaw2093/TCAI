import { formatDate } from "@/lib/format";
import type { DocumentItem, Person, Transaction } from "@/lib/types";

// Email wording lives here as plain text with blanks filled from the deal.
// To change how the emails read, edit the sentences below.

const firstName = (person: Person) => person.name.split(" ")[0];

const signature = "Best regards,\n[Your name]\nTransaction Coordinator";

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
