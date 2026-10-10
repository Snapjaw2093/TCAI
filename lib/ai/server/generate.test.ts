import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { buildFacts, defaultInclude } from "@/lib/ai/facts";
import { SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { messageReply, startFakeAnthropic, type Reply } from "@/lib/ai/server/fakeAnthropic";
import { AiError, writeDraft } from "@/lib/ai/server/generate";
import type { AiDraftRequest } from "@/lib/ai/types";

const KEY = "sk-ant-test-SECRET-KEY-12345";
const client = { id: "c1", name: "Maria Lopez", email: "maria.private@example.com", phone: "555-010-1111", role: "client" as const };
const agent = { id: "a1", name: "Dana Whitfield", email: "dana.private@example.com", phone: "555-019-9999", role: "agent" as const };
const deal = {
  id: "t1", type: "buyer" as const, status: "active" as const, propertyAddress: "42 Maple Street", clientId: "c1", agentId: "a1",
  contractDate: "2026-10-06", closingDate: "2026-11-05", price: 425_000, notes: "PRIVATE NOTE about the client", createdAt: "2026-10-06", archived: false,
};
const docs = [{ id: "d1", transactionId: "t1", name: "Agency disclosure", required: true, status: "needed" as const, dueDate: "2026-10-09" }];

const request = (over: Partial<AiDraftRequest> = {}): AiDraftRequest => ({
  draftType: "welcome", tone: "friendly", recipientRole: "client", recipientName: "Maria Lopez", instructions: "", confirmed: false,
  facts: buildFacts({
    draftType: "welcome", recipientRole: "client", recipientName: "", transaction: deal, client, agent, tasks: [], documents: docs,
    include: defaultInclude("welcome"), pickedDocumentIds: [], pickedDeadlineIds: [], extraItems: [], instructions: "", confirmed: false,
    today: new Date(2026, 9, 10),
  }).facts,
  ...over,
});

let reply: Reply | ((n: number) => Reply) = messageReply({});
let fake: Awaited<ReturnType<typeof startFakeAnthropic>>;

before(async () => {
  fake = await startFakeAnthropic(() => (typeof reply === "function" ? reply(fake.requests.length) : reply));
  process.env.ANTHROPIC_BASE_URL = fake.url;
});
after(async () => {
  delete process.env.ANTHROPIC_BASE_URL;
  await fake.close();
});
beforeEach(() => {
  fake.requests.length = 0;
  delete process.env.ANTHROPIC_EFFORT;
  delete process.env.AI_TIMEOUT_MS;
});
afterEach(() => undefined);

const good = {
  subject: "Welcome! Next steps for 42 Maple Street",
  body: "Hi Maria,\n\nWelcome aboard. Our records show contract date Oct 6, 2026; please confirm it against your copy.\n\nBest regards,\nDana",
  missing_info: [],
  used_fact_ids: ["property_address", "contract_date", "not_a_real_fact"],
};

const failsWith = async (status: number, check?: (e: AiError) => void) => {
  await assert.rejects(writeDraft(request(), { apiKey: KEY }), (e: unknown) => {
    assert.ok(e instanceof AiError, String(e));
    assert.equal(e.status, status);
    assert.ok(!e.message.includes(KEY), "the key must never appear in an error");
    check?.(e);
    return true;
  });
};

describe("writeDraft: the request we send to Claude", () => {
  it("sends the key only as a header, the fixed rules as system, and structured output", async () => {
    reply = messageReply(good);
    await writeDraft(request(), { apiKey: KEY });
    assert.equal(fake.requests.length, 1);
    const r = fake.requests[0];
    assert.equal(r.method, "POST");
    assert.equal(r.url, "/v1/messages");
    assert.equal(r.headers["x-api-key"], KEY);
    assert.ok(!JSON.stringify(r.body).includes(KEY), "the key is not in the body");
    assert.equal(r.body.model, "claude-opus-5-5");
    assert.equal(r.body.max_tokens, 4000);
    assert.equal(r.body.system, SYSTEM_PROMPT);
    assert.equal(r.body.stream, undefined);
    for (const banned of ["temperature", "top_p", "top_k", "thinking", "tool_choice", "tools"]) assert.equal(r.body[banned], undefined, banned);
    const out = r.body.output_config as { effort?: string; format: { type: string; schema: { required: string[]; additionalProperties: boolean } } };
    assert.equal(out.effort, "medium");
    assert.equal(out.format.type, "json_schema");
    assert.deepEqual(out.format.schema.required, ["subject", "body", "missing_info", "used_fact_ids"]);
    assert.equal(out.format.schema.additionalProperties, false);
  });

  it("sends only the allowed facts: no emails, phones, price, notes or ids", async () => {
    reply = messageReply(good);
    await writeDraft(request(), { apiKey: KEY });
    const sent = JSON.stringify(fake.requests[0].body);
    for (const secret of ["maria.private@example.com", "dana.private@example.com", "555-010-1111", "555-019-9999", "425000", "PRIVATE NOTE", '"t1"', '"c1"']) {
      assert.ok(!sent.includes(secret), `sent ${secret}`);
    }
    for (const needed of ["42 Maple Street", "Maria Lopez", "Oct 6, 2026", "UNVERIFIED"]) assert.ok(sent.includes(needed), needed);
  });

  it("uses the model you choose, and can leave effort out", async () => {
    reply = messageReply(good);
    process.env.ANTHROPIC_EFFORT = "off";
    await writeDraft(request(), { apiKey: KEY, model: "claude-haiku-4-5" });
    const r = fake.requests[0];
    assert.equal(r.body.model, "claude-haiku-4-5");
    assert.equal((r.body.output_config as Record<string, unknown>).effort, undefined);
  });
});

describe("writeDraft: what comes back", () => {
  it("returns subject and body, removes a sign-off, and keeps only real fact ids", async () => {
    reply = messageReply(good);
    const r = await writeDraft(request(), { apiKey: KEY });
    assert.equal(r.subject, good.subject);
    assert.ok(r.body.startsWith("Hi Maria,") && !/Best regards|Dana$/.test(r.body));
    assert.deepEqual(r.usedFactIds, ["property_address", "contract_date"]);
    assert.deepEqual(r.warnings, [], "Oct 6, 2026 is in the source");
    assert.equal(r.model, "claude-opus-5-5");
  });

  it("flags details the AI made up", async () => {
    reply = messageReply({ ...good, body: "Hi Maria,\n\nPlease sign by November 30 and call 555-444-3333. Earnest money is $9,000." });
    const r = await writeDraft(request(), { apiKey: KEY });
    assert.equal(r.warnings.length, 3);
    assert.ok(r.warnings.some((w) => w.includes("November 30")) && r.warnings.some((w) => w.includes("$9,000")));
  });

  it("collects gaps the AI left, from its list and from the text", async () => {
    reply = messageReply({ ...good, body: "Hi Maria,\n\nThe walkthrough is at [ADD: walkthrough time].", missing_info: ["closing location"] });
    const r = await writeDraft(request(), { apiKey: KEY });
    assert.deepEqual(r.missingInfo.sort(), ["closing location", "walkthrough time"]);
  });
});

describe("writeDraft: when things go wrong", () => {
  it("says the AI declined, without a draft", async () => {
    reply = { json: { ...(messageReply("x").json as object), stop_reason: "refusal" } };
    await failsWith(422, (e) => assert.match(e.message, /declined/));
  });
  it("copes with a cut-off draft", async () => {
    reply = { json: { ...(messageReply("{").json as object), stop_reason: "max_tokens" } };
    await failsWith(502, (e) => assert.match(e.message, /cut off/));
  });
  it("copes with replies that aren't the expected JSON", async () => {
    for (const text of ["not json at all", JSON.stringify({ subject: 5, body: "x" }), JSON.stringify({ subject: "s" })]) {
      reply = messageReply(text);
      await failsWith(502, (e) => assert.match(e.message, /expected format/));
    }
    reply = messageReply({ ...good, body: "   " });
    await failsWith(502, (e) => assert.match(e.message, /empty/));
  });
  it("hides a rejected API key", async () => {
    reply = { status: 401, json: { type: "error", error: { type: "authentication_error", message: `invalid x-api-key ${KEY}` } } };
    await failsWith(503, (e) => assert.match(e.message, /isn't set up correctly/));
  });
  it("explains a model the account can't use", async () => {
    reply = { status: 404, json: { type: "error", error: { type: "not_found_error", message: "model: claude-nope" } } };
    await failsWith(503, (e) => assert.match(e.message, /model isn't available/));
  });
  it("passes on a busy signal with a retry time", async () => {
    reply = { status: 429, headers: { "retry-after": "17" }, json: { type: "error", error: { type: "rate_limit_error", message: "slow down" } } };
    await failsWith(429, (e) => assert.equal(e.retryAfterSeconds, 17));
  });
  it("copes with a rejected request", async () => {
    reply = { status: 400, json: { type: "error", error: { type: "invalid_request_error", message: "bad things: secret details" } } };
    await failsWith(502, (e) => assert.ok(!e.message.includes("secret details"), "raw API text is not shown"));
  });
  it("retries a server error once, then reports it", async () => {
    reply = { status: 529, json: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } };
    await failsWith(503);
    assert.equal(fake.requests.length, 2, "one retry");
  });
  it("recovers when the retry works", async () => {
    reply = (n) => (n === 1 ? { status: 500, json: { type: "error", error: { type: "api_error", message: "oops" } } } : messageReply(good));
    const r = await writeDraft(request(), { apiKey: KEY });
    assert.ok(r.body.startsWith("Hi Maria"));
    assert.equal(fake.requests.length, 2);
  });
  it("gives up on a slow AI", async () => {
    process.env.AI_TIMEOUT_MS = "250";
    reply = { ...messageReply(good), delayMs: 1500 };
    await failsWith(504, (e) => assert.match(e.message, /too long/));
  });
  it("copes with the AI being unreachable", async () => {
    const saved = process.env.ANTHROPIC_BASE_URL;
    process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:1";
    try {
      await failsWith(502, (e) => assert.match(e.message, /Couldn't reach/));
    } finally {
      process.env.ANTHROPIC_BASE_URL = saved;
    }
  });
});
