import { createClient } from "@supabase/supabase-js";

// Who is calling the AI route? The AI costs money, so strangers must not be
// able to use it.
//
// - With Supabase on: the caller must be logged in. The browser sends its login
//   token; we check it with Supabase on the server.
// - Without Supabase (browser-only demo mode): there are no logins, so the route
//   is only open when running locally, or when AI_ALLOW_ANONYMOUS=true is set on purpose.

export type Caller = { ok: true; id: string } | { ok: false; status: number; error: string };

const verified = new Map<string, { id: string; until: number }>();

const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

export async function identifyCaller(req: Request): Promise<Caller> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (url && key) {
    const header = req.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return { ok: false, status: 401, error: "Please log in to use AI drafting." };

    const now = Date.now();
    const cached = verified.get(token);
    if (cached && cached.until > now) return { ok: true, id: cached.id };

    try {
      const { data, error } = await createClient(url, key).auth.getUser(token);
      if (error || !data.user) return { ok: false, status: 401, error: "Your login has expired. Please log in again." };
      verified.set(token, { id: data.user.id, until: now + 60_000 });
      if (verified.size > 1000) for (const [t, v] of verified) if (v.until < now) verified.delete(t);
      return { ok: true, id: data.user.id };
    } catch {
      return { ok: false, status: 503, error: "Couldn't check your login right now. Try again in a moment." };
    }
  }

  const open = process.env.AI_ALLOW_ANONYMOUS === "true" || process.env.NODE_ENV !== "production";
  if (!open) {
    return {
      ok: false,
      status: 403,
      error: "AI drafting needs Supabase login on a live site, so strangers can't use your AI key.",
    };
  }
  return { ok: true, id: `ip:${clientIp(req)}` };
}
