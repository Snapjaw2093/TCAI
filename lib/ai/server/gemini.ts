import { outputSchema, SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { AiError } from "@/lib/ai/server/errors";

// Asks Google Gemini for the draft over its REST API (no extra package needed).
// The key travels in a request header, never in the URL, and is never logged.

// A fast, inexpensive model with a free tier. Google renames and retires models
// from time to time: set GEMINI_MODEL to change it without touching code.
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

const FORMAT_RULES = `

OUTPUT FORMAT: reply with ONE JSON object and nothing else (no markdown, no code fences), matching this JSON Schema exactly:
${JSON.stringify(outputSchema)}`;

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  modelVersion?: string;
};

export async function askGemini(userMessage: string, options: { apiKey: string; model: string }): Promise<{ text: string; model: string }> {
  const base = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  const timeout = Number.parseInt(process.env.AI_TIMEOUT_MS ?? "", 10) || 45_000;
  const url = `${base}/v1beta/models/${encodeURIComponent(options.model)}:generateContent`;
  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT + FORMAT_RULES }] },
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192, temperature: 0.3 },
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
      body: payload,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new AiError("The AI took too long to answer. Please try again.", 504);
    }
    throw new AiError("Couldn't reach the AI service. Check the connection and try again.", 502);
  }

  if (!res.ok) throw await translateGemini(res);

  let data: GeminiResponse;
  try {
    data = (await res.json()) as GeminiResponse;
  } catch {
    throw new AiError("The AI's reply wasn't in the expected format. Please try again.", 502);
  }

  const candidate = data.candidates?.[0];
  const reason = candidate?.finishReason;
  if (data.promptFeedback?.blockReason || (reason && /SAFETY|PROHIBITED|BLOCKLIST|SPII|RECITATION/i.test(reason))) {
    throw new AiError("The AI declined to write this draft. Try rewording your instructions.", 422);
  }
  if (reason === "MAX_TOKENS") throw new AiError("The draft was cut off before it finished. Please try again.", 502);

  const text = (candidate?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
  if (!text.trim()) throw new AiError("The AI returned an empty draft. Please try again.", 502);
  return { text, model: data.modelVersion || options.model };
}

// Safe, useful messages. Never includes the key, the request or Google's raw message.
async function translateGemini(res: Response): Promise<AiError> {
  let detail = "";
  try {
    detail = String(((await res.json()) as { error?: { message?: string } })?.error?.message ?? "");
  } catch {
    /* not JSON */
  }
  const keyProblem = /api key|API_KEY_INVALID|permission|credential/i.test(detail);

  if (res.status === 401 || res.status === 403 || (res.status === 400 && keyProblem)) {
    console.error("[ai-draft] the Gemini API key was rejected", { status: res.status });
    return new AiError("AI drafting isn't set up correctly: the server's API key was rejected. Ask whoever runs this site to check it.", 503);
  }
  if (res.status === 404) {
    console.error("[ai-draft] Gemini model not found");
    return new AiError("AI drafting isn't set up correctly: the chosen model isn't available. Ask whoever runs this site to check GEMINI_MODEL.", 503);
  }
  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after"));
    return new AiError("The AI service is busy or its free limit was reached. Please try again shortly.", 429, Number.isFinite(retry) && retry > 0 ? retry : 60);
  }
  if (res.status >= 500) return new AiError("The AI service is having trouble right now. Please try again in a minute.", 503);
  console.error("[ai-draft] Gemini rejected the request", { status: res.status });
  return new AiError("The AI service couldn't process this request. Try simplifying it.", 502);
}
