import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// For server code that touches a signed-in person's data.
//
// The rule: the server never uses an all-powerful key. It takes the caller's own
// login token, checks it with Supabase, and then talks to the database AS THAT
// USER, so the row-level-security locks still apply to every query. A bug here
// can therefore expose at most what that one person could already see.

export type Authed =
  | { ok: true; user: { id: string; email: string | null }; db: SupabaseClient }
  | { ok: false; status: number; error: string };

export async function requireUser(req: Request): Promise<Authed> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return { ok: false, status: 404, error: "This copy of the app keeps data in the browser only, so there is nothing on the server." };
  }
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, error: "Please log in first." };

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  try {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return { ok: false, status: 401, error: "Your login has expired. Please log in again." };
    return { ok: true, user: { id: data.user.id, email: data.user.email ?? null }, db };
  } catch {
    return { ok: false, status: 503, error: "Couldn't check your login right now. Try again in a moment." };
  }
}
