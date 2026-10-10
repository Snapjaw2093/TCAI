import Anthropic from "@anthropic-ai/sdk";
import { allowedText, extractGaps, findUnsupportedDetails, stripSignOff } from "@/lib/ai/check";
import { buildUserMessage, outputSchema, SYSTEM_PROMPT } from "@/lib/ai/prompt";
import type { AiDraftRequest, AiDraftResult } from "@/lib/ai/types";

// Asks Claude to write the draft, then checks what came back. Runs only on the
// server: this is the one place the API key is used.

// Claude Opus 5.5 is a strong default. Cheaper models work too: set
// ANTHROPIC_MODEL (for example claude-sonnet-5-5 or claude-haiku-5-5).
export const DEFAULT_MODEL = "claude-opus-5-5";

// A problem the person should hear about, in plain words, with the HTTP status to send.
export class AiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

const strings = (v: unknown, max: number, each: number): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, each)).filter(Boolean).slice(0, max)
    : [];

export async function writeDraft(
  req: AiDraftRequest,
  options: { apiKey: string; model?: string },
): Promise<AiDraftResult> {
  const model = options.model || DEFAULT_MODEL;
  // ANTHROPIC_BASE_URL (if set) is read by the SDK itself; used by our tests.
  const timeout = Number.parseInt(process.env.AI_TIMEOUT_MS ?? "", 10) || 45_000;
  const client = new Anthropic({ apiKey: options.apiKey, maxRetries: 1, timeout });

  // "off" leaves effort out for models that don't accept it (e.g. Haiku 4.5).
  const effort = (process.env.ANTHROPIC_EFFORT || "medium").trim();

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(req) }],
      output_config: {
        ...(effort !== "off" ? { effort: effort as "low" | "medium" | "high" } : {}),
        format: { type: "json_schema", schema: outputSchema as unknown as Record<string, unknown> },
      },
    });
  } catch (error) {
    throw translate(error);
  }

  if (response.stop_reason === "refusal") {
    throw new AiError("The AI declined to write this draft. Try rewording your instructions.", 422);
  }
  if (response.stop_reason === "max_tokens") {
    throw new AiError("The draft was cut off before it finished. Please try again.", 502);
  }

  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiError("The AI's reply wasn't in the expected format. Please try again.", 502);
  }
  if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") {
    throw new AiError("The AI's reply wasn't in the expected format. Please try again.", 502);
  }

  const subject = parsed.subject.replace(/\s+/g, " ").trim().slice(0, 150);
  const body = stripSignOff(parsed.body.replace(/\r\n/g, "\n")).trim();
  if (!subject || !body) throw new AiError("The AI returned an empty draft. Please try again.", 502);

  const knownIds = new Set(req.facts.map((f) => f.id));
  const missingInfo = [...new Set([...strings(parsed.missing_info, 12, 160), ...extractGaps(`${subject}\n${body}`)])];

  return {
    subject,
    body,
    missingInfo,
    // Our own check, not the AI's word for it.
    warnings: findUnsupportedDetails(`${subject}\n${body}`, allowedText(req)),
    usedFactIds: strings(parsed.used_fact_ids, 60, 40).filter((id) => knownIds.has(id)),
    model: response.model,
  };
}

// Turns the SDK's errors into messages that are useful and safe to show.
// Never includes the key, the request, or Anthropic's raw message.
function translate(error: unknown): AiError {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiError("The AI took too long to answer. Please try again.", 504);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiError("Couldn't reach the AI service. Check the connection and try again.", 502);
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    console.error("[ai-draft] the Anthropic API key was rejected");
    return new AiError("AI drafting isn't set up correctly: the server's API key was rejected. Ask whoever runs this site to check it.", 503);
  }
  if (error instanceof Anthropic.NotFoundError) {
    console.error("[ai-draft] model not found");
    return new AiError("AI drafting isn't set up correctly: the chosen model isn't available to this account.", 503);
  }
  if (error instanceof Anthropic.RateLimitError) {
    const retry = Number(error.headers?.get?.("retry-after"));
    return new AiError("The AI service is busy right now. Please try again shortly.", 429, Number.isFinite(retry) && retry > 0 ? retry : 30);
  }
  if (error instanceof Anthropic.BadRequestError) {
    console.error("[ai-draft] request rejected by the API", { requestId: error.requestID });
    return new AiError("The AI service couldn't process this request. Try simplifying it.", 502);
  }
  if (error instanceof Anthropic.InternalServerError) {
    return new AiError("The AI service is having trouble right now. Please try again in a minute.", 503);
  }
  if (error instanceof Anthropic.APIError) {
    console.error("[ai-draft] unexpected API error", { status: error.status, requestId: error.requestID });
    return new AiError("The AI service returned an unexpected error. Please try again.", 502);
  }
  console.error("[ai-draft] unexpected failure");
  return new AiError("Something went wrong while writing the draft. Please try again.", 500);
}
