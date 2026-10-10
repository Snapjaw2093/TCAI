import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

// A pretend Supabase: it knows two fictional users and, like row-level security,
// only returns a user's own rows to that user's token.
const USERS: Record<string, { id: string; email: string }> = {
  "token-alice": { id: "alice-id", email: "alice@example.test" },
  "token-bob": { id: "bob-id", email: "bob@example.test" },
};
const ROWS = [
  { table: "transactions", user_id: "alice-id", property_address: "1 Alice Street" },
  { table: "transactions", user_id: "bob-id", property_address: "1 Bob Street" },
  { table: "people", user_id: "alice-id", name: "Alice Client" },
  { table: "people", user_id: "bob-id", name: "Bob Client" },
];
const PUBLISHABLE = "sb_publishable_test_only";
const seen: { path: string; apikey?: string; auth?: string }[] = [];

const bearer = (req: IncomingMessage) => String(req.headers.authorization ?? "").replace(/^Bearer /, "");
const fake = createServer((req, res) => {
  seen.push({ path: req.url ?? "", apikey: String(req.headers.apikey ?? ""), auth: String(req.headers.authorization ?? "") });
  const user = USERS[bearer(req)];
  res.setHeader("content-type", "application/json");
  if (req.url?.startsWith("/auth/v1/user")) {
    if (!user) { res.statusCode = 401; return void res.end(JSON.stringify({ msg: "invalid JWT" })); }
    return void res.end(JSON.stringify({ id: user.id, email: user.email, aud: "authenticated" }));
  }
  const table = req.url?.match(/^\/rest\/v1\/(\w+)/)?.[1];
  if (table && user) return void res.end(JSON.stringify(ROWS.filter((r) => r.table === table && r.user_id === user.id)));
  res.statusCode = 401;
  res.end(JSON.stringify({ message: "no" }));
});

let GET: (req: Request) => Promise<Response>;
before(async () => {
  await new Promise<void>((ok) => fake.listen(0, "127.0.0.1", ok));
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE;
  ({ GET } = await import("../../app/api/account/export/route"));
});
after(() => fake.close());

const call = (token?: string) =>
  GET(new Request("http://localhost/api/account/export", { headers: token ? { authorization: `Bearer ${token}` } : {} }));

test("export: no login, or a bad token, is refused before any data is read", async () => {
  seen.length = 0;
  assert.equal((await call()).status, 401);
  assert.equal((await call("token-mallory")).status, 401);
  assert.equal(seen.filter((s) => s.path.startsWith("/rest/")).length, 0, "no data requests were made");
});

test("export: a logged-in user gets only their own rows", async () => {
  const res = await call("token-alice");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-disposition") ?? "", /attachment/);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await res.json();
  assert.equal(body.account.id, "alice-id");
  assert.deepEqual(body.transactions.map((t: { property_address: string }) => t.property_address), ["1 Alice Street"]);
  assert.deepEqual(body.people.map((p: { name: string }) => p.name), ["Alice Client"]);
  assert.ok(!JSON.stringify(body).includes("Bob"));
});

test("export: the server queries as the user, never with a powerful key", async () => {
  seen.length = 0;
  await call("token-bob");
  const data = seen.filter((s) => s.path.startsWith("/rest/"));
  assert.ok(data.length >= 7);
  for (const s of data) {
    assert.equal(s.apikey, PUBLISHABLE);
    assert.equal(s.auth, "Bearer token-bob");
  }
});

test("export: slows down repeated downloads", async () => {
  let last = 200;
  for (let i = 0; i < 12; i++) last = (await call("token-bob")).status;
  assert.equal(last, 429);
});
