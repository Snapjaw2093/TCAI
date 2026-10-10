import type { AiDraftRequest, AiDraftResult } from "@/lib/ai/types";
import { supabase } from "@/lib/supabase";

// The browser side of AI drafting: sends the request to OUR server route (never
// to Anthropic directly) and turns failures into something a person can act on.

export class AiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public missing: string[] = [],
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

// With logins on, the server needs proof of who is asking.
async function authHeader(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

export async function requestAiDraft(req: AiDraftRequest): Promise<AiDraftResult> {
  let res: Response;
  try {
    res = await fetch("/api/ai/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify(req),
    });
  } catch {
    throw new AiRequestError("Couldn't reach the server. Check your connection and try again.", 0);
  }

  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    throw new AiRequestError(
      typeof data.error === "string" ? data.error : "Something went wrong while writing the draft.",
      res.status,
      Array.isArray(data.missing) ? (data.missing as string[]) : [],
      typeof data.retryAfterSeconds === "number" ? data.retryAfterSeconds : undefined,
    );
  }
  return data as unknown as AiDraftResult;
}

// Is the server set up with an API key? (Never reveals the key.)
export async function fetchAiConfigured(): Promise<boolean | null> {
  try {
    const res = await fetch("/api/ai/draft");
    if (!res.ok) return null;
    return Boolean((await res.json()).configured);
  } catch {
    return null; // unknown: let the person try
  }
}
