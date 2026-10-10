import { db } from "@/lib/data";
import type { DraftContent } from "@/lib/templates/emails";
import type { EmailDraft, Person } from "@/lib/types";

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
    kind,
    ...content,
    status: "draft",
    createdAt: new Date().toISOString(),
    sentAt: null,
  });
}
