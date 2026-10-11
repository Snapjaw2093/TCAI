// Re-checks, against a REAL Supabase project, that one account cannot see or touch
// another account's records or files. It signs in as two TEST accounts and tries
// to break in the same ways the database tests do, but through the live API.
//
//   VERIFY_CONFIRM=yes-this-is-a-test-project \
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
//   VERIFY_USER_A_EMAIL=... VERIFY_USER_A_PASSWORD=... \
//   VERIFY_USER_B_EMAIL=... VERIFY_USER_B_PASSWORD=... \
//   [APP_URL=https://your-site.vercel.app] \
//   npm run verify:supabase
//
// Use two throwaway accounts with made-up data, on your TEST project first. It adds a
// few records named "ZZ-VERIFY ..." and removes them again at the end. Passwords and
// tokens are never printed. Exits with an error if any check fails.
import { createClient } from "@supabase/supabase-js";

const env = process.env;
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const need = ["VERIFY_USER_A_EMAIL", "VERIFY_USER_A_PASSWORD", "VERIFY_USER_B_EMAIL", "VERIFY_USER_B_PASSWORD"];

if (env.VERIFY_CONFIRM !== "yes-this-is-a-test-project") {
  console.error('Refusing to run. Set VERIFY_CONFIRM=yes-this-is-a-test-project to confirm this is a TEST project with throwaway accounts.');
  process.exit(2);
}
if (!url || !key || need.some((n) => !env[n])) {
  console.error(`Missing settings. Needed: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, ${need.join(", ")}`);
  process.exit(2);
}
if (/service_role|sb_secret_/.test(key)) {
  console.error("That looks like a secret key. Use the PUBLISHABLE key only: this script must act like a normal browser.");
  process.exit(2);
}

const BUCKET = "deal-documents";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const anon = createClient(url, key, opts);
const A = createClient(url, key, opts);
const B = createClient(url, key, opts);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : detail ? "  -> " + detail : ""}`);
};
// "Refused" means nothing came back / nothing changed. An error counts as a refusal only if
// it is about permissions or the data, NOT if the request itself was rejected for an unrelated
// reason (bad key, no connection): then we can't tell whether the access rules work, so it
// must fail loudly instead of passing quietly.
const UNRELATED = /jwt|api key|apikey|invalid token|fetch failed|network|econn|enotfound|timeout|unauthorized.*key/i;
const refused = (r) => {
  if (r.error) return !UNRELATED.test(`${r.error.message ?? ""} ${r.error.code ?? ""}`);
  return r.data == null || (Array.isArray(r.data) && r.data.length === 0);
};
const errored = (r) => Boolean(r.error) && refused(r);
const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

async function login(client, email, password, label) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Couldn't sign in as test user ${label}: ${error?.message ?? "no user"}`);
  return { id: data.user.id, token: data.session.access_token };
}

// A small set of records owned by one test user.
async function seed(client, tag, userId) {
  const person = (role) => client.from("people").insert({ name: `ZZ-VERIFY ${tag} ${role}`, email: "", role }).select().single();
  const client_ = must(await person("client"), `${tag} contact`);
  const agent_ = must(await person("agent"), `${tag} contact`);
  const tx = must(
    await client.from("transactions").insert({ type: "buyer", property_address: `ZZ-VERIFY ${tag} Street`, client_id: client_.id, agent_id: agent_.id }).select().single(),
    `${tag} deal`,
  );
  const task = must(await client.from("tasks").insert({ transaction_id: tx.id, title: `ZZ-VERIFY ${tag} task` }).select().single(), `${tag} task`);
  const doc = must(await client.from("documents").insert({ transaction_id: tx.id, name: `ZZ-VERIFY ${tag} document` }).select().single(), `${tag} document`);
  const draft = must(
    await client.from("email_drafts").insert({ transaction_id: tx.id, recipient_id: client_.id, kind: "welcome", subject: `ZZ-VERIFY ${tag}`, body: "test" }).select().single(),
    `${tag} draft`,
  );
  const path = `${userId}/${tx.id}/verify-${tag}.txt`;
  const up = await client.storage.from(BUCKET).upload(path, new Blob([`ZZ-VERIFY secret of ${tag}`], { type: "text/plain" }), { contentType: "text/plain" });
  if (up.error) throw new Error(`${tag} upload: ${up.error.message}`);
  const file = must(
    await client.from("document_files").insert({ transaction_id: tx.id, document_id: doc.id, file_name: `verify-${tag}.txt`, mime_type: "text/plain", size_bytes: 20, storage_path: path }).select().single(),
    `${tag} file record`,
  );
  return { person: client_, agent: agent_, tx, task, doc, draft, file, path };
}

async function cleanup(client, userId) {
  try {
    const files = (await client.from("document_files").select("storage_path").like("file_name", "verify-%")).data ?? [];
    if (files.length) await client.storage.from(BUCKET).remove(files.map((f) => f.storage_path));
    await client.from("transactions").delete().like("property_address", "ZZ-VERIFY %");
    await client.from("people").delete().like("name", "ZZ-VERIFY %");
  } catch (e) {
    console.error(`(clean-up for ${userId} hit a problem: ${e.message}; remove "ZZ-VERIFY" records by hand)`);
  }
}

let a, b, dataA, dataB;
try {
  console.log("Signing in as the two test accounts...");
  a = await login(A, env.VERIFY_USER_A_EMAIL, env.VERIFY_USER_A_PASSWORD, "A");
  b = await login(B, env.VERIFY_USER_B_EMAIL, env.VERIFY_USER_B_PASSWORD, "B");
  if (a.id === b.id) throw new Error("The two test accounts are the same user. Use two different accounts.");
  dataA = await seed(A, "A", a.id);
  dataB = await seed(B, "B", b.id);

  // [table, A's row id, a column B will try to overwrite]
  const TABLES = [
    ["people", dataA.person.id, "name"], ["transactions", dataA.tx.id, "notes"], ["tasks", dataA.task.id, "title"],
    ["documents", dataA.doc.id, "name"], ["email_drafts", dataA.draft.id, "subject"], ["document_files", dataA.file.id, "file_name"],
  ];

  console.log("\n=== signed-out visitors");
  for (const [table] of TABLES) {
    const r = await anon.from(table).select("*");
    check(`a signed-out visitor gets nothing from ${table}`, refused(r));
  }
  check("a signed-out visitor cannot use the test-email button", errored(await anon.rpc("send_test_reminder")));
  check("a signed-out visitor cannot list the files", refused(await anon.storage.from(BUCKET).list("")));

  console.log("\n=== each account sees its own data");
  for (const [table, id] of TABLES) check(`A can read A's ${table} row`, !refused(await A.from(table).select("*").eq("id", id)));

  console.log("\n=== B cannot see, change or delete A's records");
  for (const [table, id, column] of TABLES) {
    check(`B cannot read A's ${table}`, refused(await B.from(table).select("*").eq("id", id)));
    check(`B cannot edit A's ${table}`, refused(await B.from(table).update({ [column]: "ZZ-VERIFY hijacked" }).eq("id", id).select()));
    check(`B cannot delete A's ${table}`, refused(await B.from(table).delete().eq("id", id).select()));
  }
  const stillThere = await Promise.all(TABLES.map(([t, id, column]) => A.from(t).select(column).eq("id", id)));
  check("all of A's records survived B's attempts, unchanged", stillThere.every((r) => !refused(r) && !JSON.stringify(r.data).includes("hijacked")));

  console.log("\n=== B cannot plant or link records into A's account");
  check("B cannot add a task to A's deal", errored(await B.from("tasks").insert({ transaction_id: dataA.tx.id, title: "planted" })));
  check("B cannot add a document to A's deal", errored(await B.from("documents").insert({ transaction_id: dataA.tx.id, name: "planted" })));
  check("B cannot make a draft on A's deal", errored(await B.from("email_drafts").insert({ transaction_id: dataA.tx.id, recipient_id: dataB.person.id, kind: "welcome", subject: "x", body: "x" })));
  check("B cannot address a draft to A's contact", errored(await B.from("email_drafts").insert({ transaction_id: dataB.tx.id, recipient_id: dataA.person.id, kind: "welcome", subject: "x", body: "x" })));
  check("B cannot build a deal around A's contact", errored(await B.from("transactions").insert({ type: "buyer", property_address: "ZZ-VERIFY planted", client_id: dataA.person.id, agent_id: dataB.agent.id })));
  check("B cannot write a row owned by A", errored(await B.from("people").insert({ user_id: a.id, name: "ZZ-VERIFY planted", email: "", role: "client" })));
  check("B cannot record a file against A's deal", errored(await B.from("document_files").insert({ transaction_id: dataA.tx.id, file_name: "x.txt", mime_type: "text/plain", size_bytes: 5, storage_path: `${b.id}/${dataA.tx.id}/x.txt` })));
  check("B cannot claim a path in A's folder", errored(await B.from("document_files").insert({ transaction_id: dataB.tx.id, file_name: "x.txt", mime_type: "text/plain", size_bytes: 5, storage_path: `${a.id}/${dataB.tx.id}/x.txt` })));

  console.log("\n=== stored files");
  check("A can open A's own file with a short-lived link", !(await A.storage.from(BUCKET).createSignedUrl(dataA.path, 60, { download: "x.txt" })).error);
  const signed = (await A.storage.from(BUCKET).createSignedUrl(dataA.path, 60, { download: "verify-A.txt" })).data;
  if (signed) {
    const res = await fetch(signed.signedUrl);
    check("that link downloads the file as an attachment (never as a web page)", res.ok && /attachment/i.test(res.headers.get("content-disposition") ?? ""), `status ${res.status}, ${res.headers.get("content-disposition")}`);
  }
  check("A can download A's file directly", !(await A.storage.from(BUCKET).download(dataA.path)).error);
  check("B cannot get a link to A's file", errored(await B.storage.from(BUCKET).createSignedUrl(dataA.path, 60)));
  check("B cannot download A's file", errored(await B.storage.from(BUCKET).download(dataA.path)));
  check("B cannot list A's folder", ((await B.storage.from(BUCKET).list(a.id)).data ?? []).length === 0);
  await B.storage.from(BUCKET).remove([dataA.path]);
  check("B cannot delete A's file", !(await A.storage.from(BUCKET).download(dataA.path)).error);
  check("B cannot store a file in A's folder", errored(await B.storage.from(BUCKET).upload(`${a.id}/${dataA.tx.id}/planted.txt`, new Blob(["x"], { type: "text/plain" }), { contentType: "text/plain" })));
  check("B cannot store a file against A's deal, even in B's own folder", errored(await B.storage.from(BUCKET).upload(`${b.id}/${dataA.tx.id}/planted.txt`, new Blob(["x"], { type: "text/plain" }), { contentType: "text/plain" })));
  const publicTry = await fetch(`${url}/storage/v1/object/public/${BUCKET}/${dataA.path}`);
  check("the bucket is not public (no permanent link works)", !publicTry.ok, `status ${publicTry.status}`);
  check("a program file type is refused by the storage bucket itself", errored(await A.storage.from(BUCKET).upload(`${a.id}/${dataA.tx.id}/virus.exe`, new Blob(["MZ"], { type: "application/x-msdownload" }), { contentType: "application/x-msdownload" })));
  check("an 11 MB file is refused by the storage bucket itself", errored(await A.storage.from(BUCKET).upload(`${a.id}/${dataA.tx.id}/huge.txt`, new Blob([new Uint8Array(11 * 1024 * 1024).fill(97)], { type: "text/plain" }), { contentType: "text/plain" })));

  console.log("\n=== server-only pieces stay server-only");
  for (const table of ["reminder_state", "reminder_config"]) check(`a logged-in user cannot read ${table}`, refused(await A.from(table).select("*")));
  check("a logged-in user cannot run the scheduled sender", errored(await A.rpc("send_due_reminders")));

  if (env.APP_URL) {
    console.log("\n=== the website's own server routes");
    const base = env.APP_URL.replace(/\/$/, "");
    check("export refuses a request with no login", (await fetch(`${base}/api/account/export`)).status === 401);
    check("export refuses a made-up token", (await fetch(`${base}/api/account/export`, { headers: { Authorization: "Bearer not-a-real-token" } })).status === 401);
    const ex = await fetch(`${base}/api/account/export`, { headers: { Authorization: `Bearer ${a.token}` } });
    const body = ex.ok ? await ex.json() : null;
    check("A's export works and contains only A's records", Boolean(body) && body.transactions.some((t) => t.id === dataA.tx.id) && !JSON.stringify(body).includes(dataB.tx.id), `status ${ex.status}`);
    check("the AI route refuses a request with no login", [401, 403, 503].includes((await fetch(`${base}/api/ai/draft`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status));
  } else {
    console.log("\n(Set APP_URL to also check the website's server routes.)");
  }
} catch (e) {
  fail++;
  console.error(`\nStopped early: ${e.message}`);
} finally {
  if (a) await cleanup(A, a.id);
  if (b) await cleanup(B, b.id);
}

console.log(`\n${pass} passed, ${fail} failed.`);
if (fail > 0) console.log("Do NOT put real client data in this project until every check passes.");
process.exit(fail > 0 ? 1 : 0);
