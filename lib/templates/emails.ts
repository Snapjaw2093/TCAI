import { dueLabel, formatDate } from "@/lib/format";
import type { FollowUpItem } from "@/lib/followups";
import type {
  DocumentItem,
  EmailTemplate,
  EmailTemplateKey,
  EmailTemplates,
  Person,
  Settings,
  Transaction,
} from "@/lib/types";

// How email templates work: the wording below is plain text with
// {{placeholders}} that get filled in from the deal. You can change this
// wording on the Templates page; your changes are used instead of these.
//
//   {{client_first_name}}   -> Maria
//   {{documents_needed}}    -> a heading plus a bullet list (empty = left out)
//   {{documents_needed|Docs we still need}} -> same, with your own heading

export const defaultEmailTemplates: EmailTemplates = {
  welcomeClient: {
    subject: "Welcome! Next steps for {{property_address}}",
    body:
      "Hi {{client_first_name}},\n\n" +
      "Welcome! I'm the transaction coordinator working with {{agent_name}}, and I'll be helping keep {{deal_phrase}} {{property_address}} on track from here to closing.\n\n" +
      "{{key_dates}}\n\n" +
      "{{documents_needed|To get started, we'll be gathering:}}\n\n" +
      "You'll hear from me whenever something needs your attention. In the meantime, feel free to reply to this email with any questions.\n\n" +
      "{{signature}}",
  },
  welcomeAgent: {
    subject: "Welcome! Next steps for {{property_address}}",
    body:
      "Hi {{agent_first_name}},\n\n" +
      "I'm getting started on {{property_address}} ({{deal_side}} side, client: {{client_name}}) and wanted to share what I have so far.\n\n" +
      "{{key_dates}}\n\n" +
      "{{documents_needed|Documents I'm tracking}}\n\n" +
      "Please let me know if anything is missing or if there's anything special I should watch for. I'll keep you posted as items come in.\n\n" +
      "{{signature}}",
  },
  followUpClientLate: {
    subject: "Follow-up: items needed for {{property_address}}",
    body:
      "Hi {{client_first_name}},\n\n" +
      "I'm following up on a few items for {{property_address}} that are now past due.\n\n" +
      "{{documents_needed|What we still need from you}}\n\n" +
      "{{closing_reminder}}\n\n" +
      "If you've already sent any of these, just let me know and I'll update my records. Happy to answer any questions.\n\n" +
      "{{signature}}",
  },
  followUpClientUpcoming: {
    subject: "Heads-up: upcoming items for {{property_address}}",
    body:
      "Hi {{client_first_name}},\n\n" +
      "A quick note on what's coming up for {{property_address}}.\n\n" +
      "{{documents_needed|What we still need from you}}\n\n" +
      "{{closing_reminder}}\n\n" +
      "If you've already sent any of these, just let me know and I'll update my records. Happy to answer any questions.\n\n" +
      "{{signature}}",
  },
  followUpAgent: {
    subject: "Status update: {{property_address}}",
    body:
      "Hi {{agent_first_name}},\n\n" +
      "Here's where {{property_address}} (client: {{client_name}}) stands:\n\n" +
      "{{documents_needed|Documents outstanding}}\n\n" +
      "{{tasks_needing_attention|Tasks needing attention}}\n\n" +
      "{{closing_reminder}}\n\n" +
      "Let me know if you can help move anything along or if anything has changed on your end.\n\n" +
      "{{signature}}",
  },
};

// What each template is for, shown on the Templates page.
export const emailTemplateInfo: Record<EmailTemplateKey, { label: string; when: string }> = {
  welcomeClient: { label: "Welcome email to the client", when: "Used by “Draft a welcome email” on a deal." },
  welcomeAgent: { label: "Welcome email to the agent", when: "Used by “Draft a welcome email” on a deal." },
  followUpClientLate: { label: "Follow-up to the client: past due", when: "Used when something for the client is overdue." },
  followUpClientUpcoming: { label: "Follow-up to the client: coming up", when: "Used when nothing is overdue yet." },
  followUpAgent: { label: "Status update to the agent", when: "Used by the agent follow-up on the Follow-ups page." },
};

// The placeholders you can use. "block" ones expand to a heading plus a list.
export const placeholders: { name: string; description: string; block?: boolean }[] = [
  { name: "client_first_name", description: "Client's first name" },
  { name: "client_name", description: "Client's full name" },
  { name: "agent_first_name", description: "Agent's first name" },
  { name: "agent_name", description: "Agent's full name" },
  { name: "recipient_first_name", description: "First name of whoever the email is to" },
  { name: "property_address", description: "The property address" },
  { name: "deal_side", description: "“buyer” or “seller”" },
  { name: "deal_phrase", description: "“your purchase of” or “the sale of”" },
  { name: "contract_date", description: "Contract date" },
  { name: "closing_date", description: "Closing date" },
  { name: "key_dates", description: "Contract and closing dates as a short list", block: true },
  { name: "documents_needed", description: "Documents still needed, as a list", block: true },
  { name: "tasks_needing_attention", description: "Open tasks (follow-ups only)", block: true },
  { name: "closing_reminder", description: "One sentence about the closing date (follow-ups only)" },
  { name: "signature", description: "Your signature from Settings" },
];

const defaultHeadings: Record<string, string> = {
  key_dates: "Key dates",
  documents_needed: "Documents still needed",
  tasks_needing_attention: "Tasks needing attention",
};

const firstName = (person: Person) => person.name.split(" ")[0];

const defaultSignature = "Best regards,\n[Your name]\nTransaction Coordinator";

export function buildSignature(settings: Settings): string {
  return (
    `Best regards,\n${settings.name.trim() || "[Your name]"}` +
    `${settings.title.trim() ? `\n${settings.title.trim()}` : ""}` +
    `${settings.company.trim() ? `\n${settings.company.trim()}` : ""}`
  );
}

// ---- Filling in a template ----

type Context = {
  values: Record<string, string>; // single-value placeholders
  lists: Record<string, string[]>; // block placeholders (lines)
};

const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g;

function fill(text: string, context: Context): string {
  return text
    .replace(PLACEHOLDER, (match, name: string, heading?: string) => {
      const lines = context.lists[name];
      if (lines) {
        if (lines.length === 0) return "";
        const title = heading !== undefined ? heading.trim() : defaultHeadings[name];
        return title ? `${title}\n${lines.join("\n")}` : lines.join("\n");
      }
      if (name in context.values) return context.values[name];
      return match; // unknown: leave it visible so you notice before sending
    })
    .replace(/\n{3,}/g, "\n\n") // an empty block shouldn't leave a gap
    .trim();
}

// Placeholder names used in a text that we don't recognise (typos).
export function findUnknownPlaceholders(text: string): string[] {
  const known = new Set(placeholders.map((p) => p.name));
  const unknown = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (!known.has(match[1])) unknown.add(match[1]);
  }
  return [...unknown];
}

export type DraftContent = { subject: string; body: string };

function render(template: EmailTemplate, context: Context): DraftContent {
  return { subject: fill(template.subject, context), body: fill(template.body, context) };
}

function baseContext(
  recipient: Person,
  t: Transaction,
  client: Person,
  agent: Person,
  signature: string,
): Context {
  const dateLines = [];
  if (t.contractDate) dateLines.push(`- Contract date: ${formatDate(t.contractDate)}`);
  if (t.closingDate) dateLines.push(`- Closing date: ${formatDate(t.closingDate)}`);
  const buying = t.type === "buyer";
  return {
    values: {
      client_first_name: firstName(client),
      client_name: client.name,
      agent_first_name: firstName(agent),
      agent_name: agent.name,
      recipient_first_name: firstName(recipient),
      property_address: t.propertyAddress,
      deal_side: buying ? "buyer" : "seller",
      deal_phrase: buying ? "your purchase of" : "the sale of",
      contract_date: t.contractDate ? formatDate(t.contractDate) : "",
      closing_date: t.closingDate ? formatDate(t.closingDate) : "",
      closing_reminder: "",
      signature,
    },
    lists: { key_dates: dateLines, documents_needed: [], tasks_needing_attention: [] },
  };
}

// ---- Welcome emails ----

export function buildWelcomeEmail(
  recipient: Person,
  transaction: Transaction,
  client: Person,
  agent: Person,
  documents: DocumentItem[],
  signature: string = defaultSignature,
  templates: EmailTemplates = defaultEmailTemplates,
): DraftContent {
  const context = baseContext(recipient, transaction, client, agent, signature);
  context.lists.documents_needed = documents
    .filter((d) => d.required && d.status === "needed")
    .map((d) => `- ${d.name}${d.dueDate ? ` (by ${formatDate(d.dueDate)})` : ""}`);
  return render(recipient.role === "agent" ? templates.welcomeAgent : templates.welcomeClient, context);
}

// ---- Follow-up emails ----

const itemLine = (item: FollowUpItem) =>
  `- ${item.title} (${formatDate(item.dueDate)}, ${dueLabel(item.daysUntil)})`;

export function buildFollowUpEmail(
  recipient: Person,
  transaction: Transaction,
  client: Person,
  agent: Person,
  items: FollowUpItem[],
  signature: string = defaultSignature,
  templates: EmailTemplates = defaultEmailTemplates,
): DraftContent {
  const context = baseContext(recipient, transaction, client, agent, signature);
  context.lists.documents_needed = items.filter((i) => i.kind === "document").map(itemLine);
  context.lists.tasks_needing_attention = items.filter((i) => i.kind === "task").map(itemLine);

  const closing = items.find((i) => i.kind === "closing");
  if (closing) {
    context.values.closing_reminder = `A reminder that closing is ${
      closing.daysUntil < 0
        ? `scheduled for ${formatDate(closing.dueDate)}`
        : `${formatDate(closing.dueDate)} (${dueLabel(closing.daysUntil).replace("due ", "")})`
    }.`;
  }

  if (recipient.role === "agent") return render(templates.followUpAgent, context);
  const anyLate = items.some((i) => i.daysUntil < 0 && i.kind !== "closing");
  return render(anyLate ? templates.followUpClientLate : templates.followUpClientUpcoming, context);
}

// ---- Preview on the Templates page ----

const sampleClient: Person = { id: "c", name: "Maria Lopez", email: "maria@example.com", phone: "", role: "client" };
const sampleAgent: Person = { id: "a", name: "Dana Whitfield", email: "dana@example.com", phone: "", role: "agent" };
const sampleDeal: Transaction = {
  id: "t", type: "buyer", status: "active", propertyAddress: "42 Maple Street",
  clientId: "c", agentId: "a", contractDate: "2026-10-06", closingDate: "2026-11-05",
  price: 425000, notes: "", createdAt: "2026-10-06",
};

// Shows what a template would produce for a made-up deal.
export function previewEmail(
  key: EmailTemplateKey,
  template: EmailTemplate,
  signature: string,
): DraftContent {
  const toAgent = key === "welcomeAgent" || key === "followUpAgent";
  const context = baseContext(toAgent ? sampleAgent : sampleClient, sampleDeal, sampleClient, sampleAgent, signature);
  const isFollowUp = key.startsWith("followUp");
  const late = key !== "followUpClientUpcoming";
  const docs = [
    { title: "Agency disclosure", date: "Oct 9, 2026", label: late ? "1 day overdue" : "due in 2 days" },
    { title: "Earnest money receipt", date: "Oct 11, 2026", label: late ? "due in 1 day" : "due in 4 days" },
  ];
  context.lists.documents_needed = isFollowUp
    ? docs.map((d) => `- ${d.title} (${d.date}, ${d.label})`)
    : ["- Agency disclosure (by Oct 9, 2026)", "- Earnest money receipt (by Oct 11, 2026)"];
  if (isFollowUp) {
    context.lists.tasks_needing_attention = ["- Order or confirm inspection (Oct 11, 2026, due in 1 day)"];
    context.values.closing_reminder = "A reminder that closing is Nov 5, 2026 (in 26 days).";
  }
  return render(template, context);
}
