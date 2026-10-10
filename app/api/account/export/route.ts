import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";

// "Download my data": everything the logged-in person has, as one JSON file.
// A protected operation: it needs a valid login, and it reads through that
// person's own database permissions, so it can never include anyone else's rows.
// Uploaded files are listed (name, type, size) but their contents are not included.

const TABLES = ["people", "transactions", "tasks", "documents", "email_drafts", "document_files", "settings", "templates"] as const;

const hits = new Map<string, number[]>();
const MAX_PER_MINUTE = 10;

const json = (body: object, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const now = Date.now();
  const recent = (hits.get(auth.user.id) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= MAX_PER_MINUTE) return json({ error: "Too many downloads. Try again in a minute." }, 429, { "Retry-After": "60" });
  hits.set(auth.user.id, [...recent, now]);
  if (hits.size > 1000) for (const [k, v] of hits) if (v.every((t) => now - t >= 60_000)) hits.delete(k);

  const out: Record<string, unknown> = { exportedAt: new Date(now).toISOString(), account: auth.user };
  for (const table of TABLES) {
    const { data, error } = await auth.db.from(table).select("*");
    if (error) {
      console.error(`[export] could not read ${table}: ${error.message}`);
      return json({ error: "Couldn't read your data right now. Try again in a moment." }, 502);
    }
    out[table] = data;
  }
  return json(out, 200, { "Content-Disposition": 'attachment; filename="tc-assistant-export.json"' });
}
