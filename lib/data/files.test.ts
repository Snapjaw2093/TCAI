import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { allowedTypes, buildPath, FileError, MAX_FILE_BYTES, safeFileName, typeFor, validateUpload } from "./files";

const throwsFile = (fn: () => unknown, re: RegExp) => assert.throws(fn, (e) => e instanceof FileError && re.test(e.message));

test("accepts ordinary documents and photos", () => {
  assert.deepEqual(validateUpload({ name: "Purchase Agreement.pdf", type: "application/pdf", size: 120_000 }), { name: "Purchase Agreement.pdf", type: "application/pdf" });
  assert.equal(validateUpload({ name: "photo.JPG", type: "image/jpeg", size: 3_000_000 }).type, "image/jpeg");
  assert.equal(validateUpload({ name: "terms.docx", type: "", size: 10_000 }).type.includes("wordprocessingml"), true, "blank browser type falls back to the ending");
});

test("rejects empty, oversized, and unsupported files with a readable message", () => {
  throwsFile(() => validateUpload({ name: "a.pdf", type: "application/pdf", size: 0 }), /empty/);
  throwsFile(() => validateUpload({ name: "big.pdf", type: "application/pdf", size: MAX_FILE_BYTES + 1 }), /too large/);
  throwsFile(() => validateUpload({ name: "virus.exe", type: "application/x-msdownload", size: 100 }), /isn't a type/);
  throwsFile(() => validateUpload({ name: "page.html", type: "text/html", size: 100 }), /isn't a type/);
  throwsFile(() => validateUpload({ name: "script.js", type: "text/javascript", size: 100 }), /isn't a type/);
  throwsFile(() => validateUpload({ name: "image.svg", type: "image/svg+xml", size: 100 }), /isn't a type/);
  assert.equal(typeFor("sneaky.pdf.exe", ""), null, "only the real ending counts");
  assert.equal(typeFor("evil.html", "application/pdf"), "application/pdf", "an allowed reported type is accepted (the database and bucket check again)");
});

test("file names are made safe", () => {
  assert.equal(safeFileName("../../etc/passwd"), "passwd");
  assert.equal(safeFileName("C:\\Users\\me\\contract.pdf"), "contract.pdf");
  assert.equal(safeFileName("  my  file (final)!!.pdf "), "my file final.pdf");
  assert.equal(safeFileName(".hidden"), "hidden");
  assert.equal(safeFileName("///"), "file");
  assert.ok(safeFileName("x".repeat(500) + ".pdf").length <= 150);
  assert.ok(!/[\\/]/.test(safeFileName("a/b\\c.pdf")));
});

test("storage paths put the user, then the deal, then a random prefix", () => {
  const user = "11111111-1111-1111-1111-111111111111";
  const deal = "22222222-2222-2222-2222-222222222222";
  const a = buildPath(user, deal, "../Contract.pdf");
  const b = buildPath(user, deal, "../Contract.pdf");
  assert.match(a, new RegExp(`^${user}/${deal}/[0-9a-f]{8}-Contract\\.pdf$`));
  assert.notEqual(a, b, "two uploads of the same name never collide");
  assert.ok(!a.includes(".."));
});

test("the app's allowed types match the database's exactly", () => {
  const sql = readFileSync("supabase/migrations/0003_document_files.sql", "utf8");
  const listed = (block: string) => [...block.matchAll(/'([a-z]+\/[a-z0-9.+-]+)'/g)].map((m) => m[1]).sort();
  const check = sql.slice(sql.indexOf("mime_type in ("), sql.indexOf("char_length(storage_path)"));
  const bucket = sql.slice(sql.indexOf("allowed_mime_types"), sql.indexOf("on conflict (id)"));
  const app = Object.keys(allowedTypes).sort();
  assert.deepEqual(listed(check), app, "table check list differs from lib/data/files.ts");
  assert.deepEqual(listed(bucket.slice(bucket.indexOf("array["))), app, "bucket list differs from lib/data/files.ts");
  assert.ok(sql.includes(String(MAX_FILE_BYTES)), "size limit differs");
});
