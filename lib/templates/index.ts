import { defaultChecklistTemplates } from "@/lib/templates/checklists";
import { defaultEmailTemplates } from "@/lib/templates/emails";
import type { EmailTemplateKey, UserTemplates } from "@/lib/types";

export const defaultTemplates: UserTemplates = {
  checklists: defaultChecklistTemplates,
  emails: defaultEmailTemplates,
};

// Combines what you saved with the built-in templates. Anything you haven't
// changed (or that is missing or damaged) falls back to the built-in one, so
// new built-in templates added later still show up.
export function withDefaults(saved: Partial<UserTemplates> | null | undefined): UserTemplates {
  const emails = { ...defaultEmailTemplates };
  for (const key of Object.keys(emails) as EmailTemplateKey[]) {
    const mine = saved?.emails?.[key];
    if (mine && typeof mine.subject === "string" && typeof mine.body === "string") {
      emails[key] = { subject: mine.subject, body: mine.body };
    }
  }

  const checklists = { ...defaultChecklistTemplates };
  for (const type of ["buyer", "seller"] as const) {
    const mine = saved?.checklists?.[type];
    if (mine && Array.isArray(mine.tasks) && Array.isArray(mine.documents)) {
      checklists[type] = mine;
    }
  }
  return { checklists, emails };
}
