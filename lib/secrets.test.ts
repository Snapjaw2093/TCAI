import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// A guard against the worst mistake: an all-powerful database key in the app.
// The service-role key bypasses every row-level-security lock, so no code here
// may read it, and nothing secret may be given a NEXT_PUBLIC_ name (those are
// copied into the browser for every visitor).

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", ".git"].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.(ts|tsx|js|mjs)$/.test(name) && !name.endsWith(".test.ts")) yield path;
  }
}
const files = ["app", "components", "lib"].flatMap((d) => [...sourceFiles(d)]);

test("no app code touches a service-role / secret Supabase key", () => {
  const bad = files.filter((f) => /service_role|SERVICE_ROLE|SUPABASE_SECRET|sb_secret_/.test(readFileSync(f, "utf8")));
  assert.deepEqual(bad, []);
});

test("secrets never get a NEXT_PUBLIC_ name", () => {
  const bad = files.filter((f) => /NEXT_PUBLIC_\w*(SECRET|SERVICE|ANTHROPIC|API_KEY|PRIVATE)/.test(readFileSync(f, "utf8")));
  assert.deepEqual(bad, []);
});

test("browser code never reads the AI key from the environment", () => {
  const clientFiles = files.filter((f) => /^(components|lib\/(data|ai\/client))/.test(f) || readFileSync(f, "utf8").startsWith('"use client"'));
  const bad = clientFiles.filter((f) => /process\.env\.ANTHROPIC/.test(readFileSync(f, "utf8")));
  assert.deepEqual(bad, []);
});
