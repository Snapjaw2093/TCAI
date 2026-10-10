import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { GET, POST } from "@/app/api/ai/draft/route";
import { buildFacts, defaultInclude } from "@/lib/ai/facts";
import { resetRateLimits } from "@/lib/ai/rateLimit";
import { messageReply, startFakeAnthropic, type Reply } from "@/lib/ai/server/fakeAnthropic";
import type { AiDraftRequest } from "@/lib/ai/types";

const KEY = "sk-ant-route-SECRET-98765";
const env = process.env as Record<string, string | undefined>;
const client = { id: "c1", name: "Maria Lopez", email: "m@example.com", phone: "555", role: "client" as const };
const agent = { id: "a1", name: "Dana Whitfield", email: "d@example.com", phone: "555", role: "agent" as const };
const deal = {
  id: "t1", type: "buyer" as const, status: "active" as const, propertyAddress: "42 Maple Street", clientId: "c1", agentId: "a1",
  contractDate: "2026-10-06", closingDate: "2026-11-05", price: null, notes: "", createdAt: "2026-10-06", archived: false,
};

const body = (over: Partial<AiDraftRequest> = {}): AiDraftRequest => ({
  draftType: "welcome", tone: "friendly", recipientRole: "client", recipientName: "Maria Lopez", instructions: "", confirmed: false,
  facts: buildFacts({
    draftType: "welcome", recipientRole: "client", recipientName: "", transaction: deal, client, agent, tasks: [], documents: [],
    include: defaultInclude("welcome"), pickedDocumentIds: [], pickedDeadlineIds: [], extraItems: [], instructions: "", confirmed: false,
    today: new Date(2026, 9, 10),
  }).facts,
  ...over,
});

const call = (payload: unknown, headers: Record<string, string> = {}, raw?: string) =>
  POST(
    new Request("http://localhost/api/ai/draft", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9", ...headers },
      body: raw ?? JSON.stringify(payload),
    }),
  );

const good = { subject: "Welcome", body: "Hi Maria,\n\nWelcome to the team.", missing_info: [], used_fact_ids: ["property_address"] };
let reply: Reply = messageReply(good);
let fake: Awaited<ReturnType<typeof startFakeAnthropic>>;

before(async () => {
  fake = await startFakeAnthropic(() => reply);
  env.ANTHROPIC_BASE_URL = fake.url;
});
after(async () => {
  delete env.ANTHROPIC_BASE_URL;
  await fake.close();
});
beforeEach(() => {
  reply = messageReply(good);
  fake.requests.length = 0;
  resetRateLimits();
  env.ANTHROPIC_API_KEY = KEY;
  env.NODE_ENV = "development";
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "AI_ALLOW_ANONYMOUS", "AI_RATE_LIMIT_PER_MINUTE", "AI_RATE_LIMIT_PER_DAY", "AI_GLOBAL_DAILY_LIMIT", "ANTHROPIC_MODEL"]) delete env[k];
});
afterEach(() => undefined);

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

describe("GET /api/ai/draft", () => {
  it("says whether AI drafting is set up, without revealing anything", async () => {
    let r = await json(await GET());
    assert.deepEqual(r, { configured: true });
    delete env.ANTHROPIC_API_KEY;
    r = await json(await GET());
    assert.deepEqual(r, { configured: false });
  });
});

describe("POST /api/ai/draft", () => {
  it("answers clearly when no API key is set, and calls nothing", async () => {
    delete env.ANTHROPIC_API_KEY;
    const res = await call(body());
    assert.equal(res.status, 503);
    assert.equal((await json(res)).code, "not_configured");
    assert.equal(fake.requests.length, 0);
  });

  it("writes a draft and never returns the key", async () => {
    const res = await call(body());
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const text = JSON.stringify(await res.clone().json());
    assert.ok(!text.includes(KEY));
    const r = await json(res);
    assert.equal(r.subject, "Welcome");
    assert.deepEqual(Object.keys(r).sort(), ["body", "missingInfo", "model", "subject", "usedFactIds", "warnings"]);
    assert.equal(fake.requests.length, 1);
  });

  it("uses ANTHROPIC_MODEL when set", async () => {
    env.ANTHROPIC_MODEL = "claude-sonnet-5-5";
    await call(body());
    assert.equal(fake.requests[0].body.model, "claude-sonnet-5-5");
  });

  it("rejects bad requests before spending anything", async () => {
    assert.equal((await call(null, {}, "{not json")).status, 400);
    assert.equal((await call({ nonsense: true })).status, 400);
    assert.equal((await call(body({ tone: "rude" as never }))).status, 400);
    assert.equal(fake.requests.length, 0);
  });

  it("refuses oversized requests", async () => {
    assert.equal((await call(null, {}, "x".repeat(70_000))).status, 413);
    assert.equal((await call(body(), { "content-length": "999999" })).status, 413);
    assert.equal(fake.requests.length, 0);
  });

  it("is closed to strangers on a live site without logins, open locally", async () => {
    env.NODE_ENV = "production";
    const blocked = await call(body());
    assert.equal(blocked.status, 403);
    assert.equal(fake.requests.length, 0);
    env.AI_ALLOW_ANONYMOUS = "true";
    assert.equal((await call(body())).status, 200);
  });

  it("asks for missing information instead of drafting", async () => {
    const res = await call(body({ draftType: "custom", instructions: "hi" }));
    assert.equal(res.status, 422);
    const r = await json(res);
    assert.equal(r.code, "missing_info");
    assert.ok((r.missing as string[]).some((m) => /Describe/.test(m)));
    assert.equal(fake.requests.length, 0, "the AI is not called");
    assert.equal((await call(body({ draftType: "missing-documents" }))).status, 422);
    assert.equal((await call(body({ draftType: "signature-reminder" }))).status, 422);
    assert.equal((await call(body({ draftType: "deadline-reminder" }))).status, 422);
    const noName = body({ recipientRole: "lender", recipientName: null });
    noName.facts = noName.facts.filter((f) => f.id !== "recipient_name");
    assert.equal((await call(noName)).status, 422);
  });

  it("does not count rejected or incomplete requests against the limit", async () => {
    env.AI_RATE_LIMIT_PER_MINUTE = "1";
    for (let i = 0; i < 4; i++) await call(body({ draftType: "custom", instructions: "" }));
    for (let i = 0; i < 4; i++) await call({ nonsense: true });
    assert.equal((await call(body())).status, 200, "the first real request still goes through");
  });

  it("limits how often one person can draft", async () => {
    env.AI_RATE_LIMIT_PER_MINUTE = "2";
    assert.equal((await call(body())).status, 200);
    assert.equal((await call(body())).status, 200);
    const third = await call(body());
    assert.equal(third.status, 429);
    assert.ok(Number(third.headers.get("retry-after")) >= 1);
    assert.match(String((await json(third)).error), /bit fast/);
    assert.equal(fake.requests.length, 2, "the third never reached the AI");
    assert.equal((await call(body(), { "x-forwarded-for": "8.8.8.8" })).status, 200, "other people unaffected");
  });

  it("has a daily cap for the whole site", async () => {
    env.AI_GLOBAL_DAILY_LIMIT = "2";
    env.AI_RATE_LIMIT_PER_MINUTE = "50";
    await call(body(), { "x-forwarded-for": "1.1.1.1" });
    await call(body(), { "x-forwarded-for": "2.2.2.2" });
    const res = await call(body(), { "x-forwarded-for": "3.3.3.3" });
    assert.equal(res.status, 429);
    assert.match(String((await json(res)).error), /daily limit for this site/);
  });

  it("turns AI failures into safe messages", async () => {
    reply = { status: 401, json: { type: "error", error: { type: "authentication_error", message: `bad key ${KEY}` } } };
    const res = await call(body());
    assert.equal(res.status, 503);
    const text = JSON.stringify(await res.json());
    assert.ok(!text.includes(KEY) && !text.includes("bad key"));
  });

  it("passes a refusal through as a clear message", async () => {
    reply = { json: { ...(messageReply("x").json as object), stop_reason: "refusal" } };
    const res = await call(body());
    assert.equal(res.status, 422);
    assert.match(String((await json(res)).error), /declined/);
  });
});
