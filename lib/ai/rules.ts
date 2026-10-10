import type { AiDraftType, AiFact, AiRecipientRole } from "@/lib/ai/types";

// What a draft must have before we will ask the AI to write it. If something is
// missing we ask the person for it, instead of letting the AI guess.
// Used by the screen (to explain what to add) AND by the server (so the rule
// can't be skipped by calling the route directly).

const has = (facts: AiFact[], prefix: string) => facts.some((f) => f.id.startsWith(prefix));

export function requiredProblems(
  draftType: AiDraftType,
  recipientRole: AiRecipientRole,
  facts: AiFact[],
  instructions: string,
): string[] {
  const problems: string[] = [];

  // The deal's client and agent come with a name; anyone else needs one typed in.
  if (!facts.some((f) => f.id === "recipient_name" && f.value.trim())) {
    problems.push(
      recipientRole === "client" || recipientRole === "agent"
        ? "This deal has no name saved for the recipient. Edit the deal to add one."
        : "Add the recipient's name so the email can greet them.",
    );
  }

  switch (draftType) {
    case "missing-documents":
      if (!has(facts, "doc_") && !has(facts, "extra_doc_")) {
        problems.push("Pick at least one outstanding document, or type the documents you need.");
      }
      break;
    case "signature-reminder":
      if (!has(facts, "sign_")) {
        problems.push(
          "Pick the documents waiting for a signature. TC Assistant doesn't track signatures, so we need you to tell us which.",
        );
      }
      break;
    case "deadline-reminder":
      if (!has(facts, "deadline_")) {
        problems.push("Pick at least one deadline to remind them about.");
      }
      break;
    case "custom":
      if (instructions.trim().length < 10) {
        problems.push("Describe what the email should say (at least a short sentence).");
      }
      break;
    default:
      break;
  }
  return problems;
}
