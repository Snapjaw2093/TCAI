import { db } from "@/lib/data";
import { findFollowUps } from "@/lib/followups";
import {
  buildFollowUpEmail,
  buildSignature,
  buildWelcomeEmail,
  type DraftContent,
} from "@/lib/templates/emails";
import type { EmailDraft, Person, Task } from "@/lib/types";

export type DraftPurpose = "welcome" | "follow-up";

// Saves a new, unapproved draft for a transaction.
export function createDraft(
  transactionId: string,
  recipient: Person,
  kind: EmailDraft["kind"],
  content: DraftContent,
): Promise<EmailDraft> {
  return db.saveDraft({
    transactionId,
    recipientId: recipient.id,
    recipientEmail: recipient.email,
    kind,
    ...content,
    status: "draft",
    createdAt: new Date().toISOString(),
    sentAt: null,
  });
}

// Writes the subject and message for a deal from your saved templates and the
// deal's current details. Nothing is saved here.
// Note: this fills in templates; it is not AI writing.
export async function generateContent(
  transactionId: string,
  recipientId: string,
  purpose: DraftPurpose,
): Promise<DraftContent> {
  const [transaction, people, settings, templates, tasks, documents] = await Promise.all([
    db.getTransaction(transactionId),
    db.listPeople(),
    db.getSettings(),
    db.getTemplates(),
    db.listTasks(transactionId),
    db.listDocuments(transactionId),
  ]);
  if (!transaction) throw new Error("That transaction no longer exists.");
  const recipient = people.find((p) => p.id === recipientId);
  const client = people.find((p) => p.id === transaction.clientId);
  const agent = people.find((p) => p.id === transaction.agentId);
  if (!recipient || !client || !agent) throw new Error("This deal is missing its client or agent.");
  const signature = buildSignature(settings);

  if (purpose === "welcome") {
    return buildWelcomeEmail(recipient, transaction, client, agent, documents, signature, templates.emails);
  }

  const items = findFollowUps([transaction], tasks, documents, settings.followUpDays)[0]?.items ?? [];
  if (items.length === 0) {
    throw new Error(
      "Nothing is overdue or coming up for this deal, so there's nothing to follow up on yet.",
    );
  }
  if (recipient.role === "client" && items.every((i) => i.kind === "task")) {
    throw new Error("Only internal tasks are due, so there's nothing to ask the client for right now.");
  }
  return buildFollowUpEmail(recipient, transaction, client, agent, items, signature, templates.emails);
}

export async function generateDraft(
  transactionId: string,
  recipientId: string,
  purpose: DraftPurpose,
): Promise<EmailDraft> {
  const content = await generateContent(transactionId, recipientId, purpose);
  const recipient = (await db.listPeople()).find((p) => p.id === recipientId)!;
  return createDraft(transactionId, recipient, purpose, content);
}

// Starts a new deal's onboarding emails: one for the client, one for the agent.
export async function createWelcomeDrafts(
  transactionId: string,
  clientId: string,
  agentId: string,
): Promise<EmailDraft[]> {
  const drafts: EmailDraft[] = [];
  for (const id of [clientId, agentId]) drafts.push(await generateDraft(transactionId, id, "welcome"));
  return drafts;
}

// Rewrites an existing draft from the current templates and deal details.
// The address you typed in "To" is kept; the draft goes back to "draft" status.
export async function regenerateDraft(draft: EmailDraft): Promise<EmailDraft> {
  const content = await generateContent(draft.transactionId, draft.recipientId, draft.kind);
  return db.saveDraft({ ...draft, ...content, status: "draft", sentAt: null });
}

// Saves a draft you edited, approved, or marked as sent. Marking a welcome
// email as sent also ticks off the "Send welcome email" task on the checklist.
export async function saveDraftWithEffects(
  draft: EmailDraft,
): Promise<{ draft: EmailDraft; completedTask: Task | null }> {
  const saved = await db.saveDraft(draft);
  let completedTask: Task | null = null;
  if (saved.status === "sent" && saved.kind === "welcome") {
    const task = (await db.listTasks(saved.transactionId)).find(
      (t) => t.key === "welcome-email" && t.status === "open",
    );
    if (task) completedTask = await db.saveTask({ ...task, status: "done" });
  }
  return { draft: saved, completedTask };
}

// The three things a draft card can ask for. Each screen supplies how to
// update what it is showing afterwards.
export type DraftActions = {
  save: (draft: EmailDraft) => Promise<void>;
  regenerate: (draft: EmailDraft) => Promise<void>;
  remove: (draft: EmailDraft) => Promise<void>;
};

export function makeDraftActions(apply: {
  upsert: (draft: EmailDraft, completedTask: Task | null) => void;
  remove: (id: string) => void;
}): DraftActions {
  return {
    save: async (draft) => {
      const { draft: saved, completedTask } = await saveDraftWithEffects(draft);
      apply.upsert(saved, completedTask);
    },
    regenerate: async (draft) => {
      apply.upsert(await regenerateDraft(draft), null);
    },
    remove: async (draft) => {
      await db.deleteDraft(draft.id);
      apply.remove(draft.id);
    },
  };
}
