import {
  aiLimits,
  draftTypes,
  recipientRoles,
  tones,
  type AiDraftRequest,
  type AiFact,
} from "@/lib/ai/types";

// Checks what arrives at the server route. Never trust the browser: this makes
// sure the shape is right, the sizes are small, and nothing odd gets through.

export type Validation = { ok: true; value: AiDraftRequest } | { ok: false; error: string };

const clean = (v: string) =>
  v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function validateRequest(body: unknown): Validation {
  if (!isObject(body)) return { ok: false, error: "The request must be a JSON object." };

  const draftType = body.draftType;
  const tone = body.tone;
  const role = body.recipientRole;
  if (typeof draftType !== "string" || !(draftTypes as readonly string[]).includes(draftType)) {
    return { ok: false, error: "Unknown draft type." };
  }
  if (typeof tone !== "string" || !(tones as readonly string[]).includes(tone)) {
    return { ok: false, error: "Unknown tone." };
  }
  if (typeof role !== "string" || !(recipientRoles as readonly string[]).includes(role)) {
    return { ok: false, error: "Unknown recipient role." };
  }

  const name = body.recipientName;
  if (name !== null && name !== undefined && (typeof name !== "string" || name.length > aiLimits.maxName)) {
    return { ok: false, error: `The recipient name must be ${aiLimits.maxName} characters or fewer.` };
  }

  const instructions = body.instructions ?? "";
  if (typeof instructions !== "string" || instructions.length > aiLimits.maxInstructions) {
    return { ok: false, error: `Instructions must be ${aiLimits.maxInstructions} characters or fewer.` };
  }
  if (typeof body.confirmed !== "boolean") return { ok: false, error: "Missing the confirmation flag." };

  if (!Array.isArray(body.facts) || body.facts.length === 0) {
    return { ok: false, error: "No transaction information was provided." };
  }
  if (body.facts.length > aiLimits.maxFacts) {
    return { ok: false, error: `Too many items (the limit is ${aiLimits.maxFacts}).` };
  }

  const facts: AiFact[] = [];
  const seen = new Set<string>();
  for (const raw of body.facts) {
    if (!isObject(raw)) return { ok: false, error: "Each item must be an object." };
    const { id, label, value, source, unverified } = raw;
    if (
      typeof id !== "string" ||
      !/^[a-z0-9_]{1,40}$/.test(id) ||
      typeof label !== "string" ||
      typeof value !== "string" ||
      typeof source !== "string" ||
      typeof unverified !== "boolean"
    ) {
      return { ok: false, error: "An item is malformed." };
    }
    if (seen.has(id)) return { ok: false, error: "Duplicate item ids." };
    seen.add(id);
    if (label.length > aiLimits.maxLabel || value.length > aiLimits.maxValue || source.length > 60) {
      return { ok: false, error: "An item is too long." };
    }
    facts.push({ id, label: clean(label), value: clean(value), source: clean(source), unverified });
  }

  return {
    ok: true,
    value: {
      draftType: draftType as AiDraftRequest["draftType"],
      tone: tone as AiDraftRequest["tone"],
      recipientRole: role as AiDraftRequest["recipientRole"],
      recipientName: typeof name === "string" && clean(name) ? clean(name) : null,
      instructions: clean(instructions),
      confirmed: body.confirmed,
      facts,
    },
  };
}
