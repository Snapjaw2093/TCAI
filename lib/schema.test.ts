import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { build } from "../scripts/build-sql.mjs";

test("the generated database setup files match the migrations", () => {
  const { schema, ts } = build() as { schema: string; ts: string };
  assert.equal(readFileSync("supabase/schema.sql", "utf8"), schema, 'run "npm run build:sql"');
  assert.equal(readFileSync("lib/schemaUpdateSql.ts", "utf8"), ts, 'run "npm run build:sql"');
});
