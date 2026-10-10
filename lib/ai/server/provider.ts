// Which AI service writes the drafts, and with which key. Read from the server's
// environment each time, never frozen into the build.
//
//   AI_PROVIDER=anthropic | gemini      (optional)
//   ANTHROPIC_API_KEY, ANTHROPIC_MODEL  Claude
//   GEMINI_API_KEY,    GEMINI_MODEL     Google Gemini
//
// If AI_PROVIDER isn't set, whichever key exists is used (Claude wins if both do).

export type Provider = "anthropic" | "gemini";
export type ProviderConfig = { provider: Provider; apiKey: string; model?: string };

const clean = (v: string | undefined) => v?.trim() || undefined;

export function resolveProvider(env: Record<string, string | undefined> = process.env): ProviderConfig | null {
  const anthropic = clean(env.ANTHROPIC_API_KEY);
  const gemini = clean(env.GEMINI_API_KEY);
  const wanted = clean(env.AI_PROVIDER)?.toLowerCase();

  const provider: Provider | null =
    wanted === "gemini" ? "gemini" : wanted === "anthropic" ? "anthropic" : anthropic ? "anthropic" : gemini ? "gemini" : null;
  if (!provider) return null;

  if (provider === "gemini") return gemini ? { provider, apiKey: gemini, model: clean(env.GEMINI_MODEL) } : null;
  return anthropic ? { provider, apiKey: anthropic, model: clean(env.ANTHROPIC_MODEL) } : null;
}
