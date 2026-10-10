import { connection, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/ai/rateLimit";
import { requiredProblems } from "@/lib/ai/rules";
import { identifyCaller } from "@/lib/ai/server/auth";
import { AiError, writeDraft } from "@/lib/ai/server/generate";
import { validateRequest } from "@/lib/ai/validate";

// POST /api/ai/draft - asks Claude to write one email draft.
//
// The AI key lives ONLY here, in the ANTHROPIC_API_KEY environment variable.
// It is never sent to the browser. This route only reads what it is sent and
// answers with text: it cannot send email, contact anyone, or change any saved
// transaction data.

export const maxDuration = 60;

const MAX_REQUEST_CHARS = 60_000;

const reply = (body: object, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

// Lets the screen ask "is AI drafting set up?" without trying to write anything.
export async function GET() {
  // Read at request time, never frozen into the build.
  // (Outside a real request, such as in unit tests, there is nothing to wait for.)
  try {
    await connection();
  } catch {
    /* not in a request */
  }
  return reply({ configured: Boolean(process.env.ANTHROPIC_API_KEY?.trim()) });
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return reply(
      { code: "not_configured", error: "AI drafting isn't set up yet. The site owner needs to add an ANTHROPIC_API_KEY." },
      503,
    );
  }

  // 1. Size and shape.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST_CHARS) {
    return reply({ error: "That request is too large." }, 413);
  }
  const raw = await request.text();
  if (raw.length > MAX_REQUEST_CHARS) return reply({ error: "That request is too large." }, 413);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return reply({ error: "The request wasn't valid JSON." }, 400);
  }
  const checked = validateRequest(json);
  if (!checked.ok) return reply({ error: checked.error }, 400);
  const draft = checked.value;

  // 2. Who is asking?
  const caller = await identifyCaller(request);
  if (!caller.ok) return reply({ error: caller.error }, caller.status);

  // 3. Is everything the draft needs here? If not, ask, don't guess.
  const missing = requiredProblems(draft.draftType, draft.recipientRole, draft.facts, draft.instructions);
  if (missing.length > 0) {
    return reply({ code: "missing_info", error: "More information is needed before this can be drafted.", missing }, 422);
  }

  // 4. Not too often.
  const limit = checkRateLimit(caller.id);
  if (!limit.ok) {
    const message =
      limit.scope === "minute"
        ? "You're drafting a bit fast. Wait a moment and try again."
        : limit.scope === "day"
          ? "You've reached today's limit for AI drafts. It resets within 24 hours."
          : "AI drafting has reached its daily limit for this site. Please try again tomorrow.";
    return reply({ code: "rate_limited", error: message, retryAfterSeconds: limit.retryAfterSeconds }, 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  // 5. Write it.
  try {
    const result = await writeDraft(draft, { apiKey, model: process.env.ANTHROPIC_MODEL?.trim() || undefined });
    return reply(result);
  } catch (error) {
    if (error instanceof AiError) {
      return reply(
        { error: error.message, ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}) },
        error.status,
        error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : {},
      );
    }
    console.error("[ai-draft] unexpected failure");
    return reply({ error: "Something went wrong while writing the draft. Please try again." }, 500);
  }
}
