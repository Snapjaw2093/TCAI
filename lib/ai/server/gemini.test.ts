import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { GET, POST } from "@/app/api/ai/draft/route";
import { buildFacts, defaultInclude } from "@/lib/ai/facts";
import { resetRateLimits } from "@/lib/ai/rateLimit";
import { geminiReply, startFakeAnthropic, type Reply } from "@/lib/ai/server/fakeAnthropic";
import { AiError, writeDraft } from "@/lib/ai/server/generate";
import { resolveProvider } from "@/lib/ai/server/provider";
import type { AiDraftRequest } from "@/lib/ai/types";

const KEY = "AIza-test-SECRET-KEY-55555";
const env = process.env as Record<string, string | undefined>;
const client = { id: "c1", name: "Maria Lopez", email: "maria.private@example.com", phone: "555-010-1111", role: "client" as const };
const agent = { id: "a1", name: "Dana Whitfield", email: "dana.private@example.com", phone: "555-019-9999", role: "agent" as const };
const deal = {
  id: "t1", type: "buyer" as const, status: "active" as const, propertyAddress: "42 Maple Street", clientId: "c1", agentId: "a1",
  contractDate: "2026-10-06", closingDate: "2026-11-05", price: 425_000, notes: "PRIVATE NOTE", createdAt: "2026-10-06", archived: false,
};
const body = (): AiDraftRequest => ({
  draftType: "welcome", tone: "friendly", recipientRole: "client", recipientName: "Maria Lopez", instructions: "", confirmed: false,
  facts: buildFacts({
    draftType: "welcome", recipientRole: "client", recipientName: "", transaction: deal, client, agent, tasks: [], documents: [],
    include: defaultInclude("welcome"), pickedDocumentIds: [], pickedDeadlineIds: [], extraItems: [], instructions: "", confirmed: false,
    today: new Date(2026, 9, 10),
  }).facts,
});
const good = { subject: "Welcome! Next steps for 42 Maple Street", body: "Hi Maria,\n\nWelcome aboard.\n\nBest regards,\nDana", missing_info: [], used_fact_ids: ["property_address", "nope"] };

let reply: Reply = geminiReply(good);
let fake: Awaited<ReturnType<typeof startFakeAnthropic>>;
before(async () => {
  fake = await startFakeAnthropic(() => reply);
  env.GEMINI_BASE_URL = fake.url;
});
after(async () => {
  delete env.GEMINI_BASE_URL;
  await fake.close();
});
beforeEach(() => {
  reply = geminiReply(good);
  fake.requests.length = 0;
  resetRateLimits();
  for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "AI_PROVIDER", "GEMINI_MODEL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "AI_TIMEOUT_MS"]) delete env[k];
  env.GEMINI_API_KEY = KEY;
  env.NODE_ENV = "development";
});

describe("choosing the AI service", () => {
  it("uses whichever key exists, Claude first, and AI_PROVIDER overrides", () => {
    assert.deepEqual(resolveProvider({}), null);
    assert.equal(resolveProvider({ GEMINI_API_KEY: "g" })?.provider, "gemini");
    assert.equal(resolveProvider({ ANTHROPIC_API_KEY: "a" })?.provider, "anthropic");
    assert.equal(resolveProvider({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" })?.provider, "anthropic");
    assert.equal(resolveProvider({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g", AI_PROVIDER: "gemini" })?.provider, "gemini");
    assert.equal(resolveProvider({ GEMINI_API_KEY: "g", AI_PROVIDER: "anthropic" }), null, "named provider has no key");
    assert.equal(resolveProvider({ GEMINI_API_KEY: " g ", GEMINI_MODEL: " m " })?.model, "m");
  });
});

describe("Gemini drafts", () => {
  it("sends the key as a header only, asks for JSON, and parses the answer", async () => {
    const result = await writeDraft(body(), { provider: "gemini", apiKey: KEY });
    const sent = fake.requests[0];
    assert.match(sent.url, /^\/v1beta\/models\/gemini-2\.5-flash:generateContent$/);
    assert.equal(sent.headers["x-goog-api-key"], KEY);
    assert.ok(!sent.url.includes(KEY) && !JSON.stringify(sent.body).includes(KEY), "key only in the header");
    const cfg = sent.body.generationConfig as Record<string, unknown>;
    assert.equal(cfg.responseMimeType, "application/json");
    assert.match(JSON.stringify(sent.body.systemInstruction), /ONE JSON object/);
    const payload = JSON.stringify(sent.body);
    for (const secret of ["555-010-1111", "maria.private@example.com", "425000", "PRIVATE NOTE"]) assert.ok(!payload.includes(secret), `never sent ${secret}`);
    assert.equal(result.subject, good.subject);
    assert.ok(!result.body.includes("Dana"), "sign-off stripped");
    assert.deepEqual(result.usedFactIds, ["property_address"]);
    assert.equal(result.model, "gemini-test");
  });

  it("accepts JSON wrapped in a code fence and ignores 'thought' parts", async () => {
    reply = geminiReply("", {
      candidates: [{ content: { parts: [{ text: "thinking...", thought: true }, { text: "```json\n" + JSON.stringify(good) + "\n```" }] }, finishReason: "STOP" }],
    });
    const result = await writeDraft(body(), { provider: "gemini", apiKey: KEY });
    assert.equal(result.subject, good.subject);
  });

  it("uses GEMINI_MODEL when given", async () => {
    await writeDraft(body(), { provider: "gemini", apiKey: KEY, model: "gemini-custom" });
    assert.match(fake.requests[0].url, /models\/gemini-custom:generateContent/);
  });

  it("flags details the AI invented, same as with Claude", async () => {
    reply = geminiReply({ ...good, body: "Hi Maria,\n\nClosing is on November 30 at 4:15 PM." });
    const result = await writeDraft(body(), { provider: "gemini", apiKey: KEY });
    assert.ok(result.warnings.length >= 1);
  });
});

describe("Gemini going wrong", () => {
  const fails = async (status: number, check?: (e: AiError) => void) =>
    assert.rejects(writeDraft(body(), { provider: "gemini", apiKey: KEY }), (e: unknown) => {
      assert.ok(e instanceof AiError, String(e));
      assert.equal(e.status, status);
      assert.ok(!e.message.includes(KEY), "never the key");
      check?.(e);
      return true;
    });

  it("explains a rejected key, a missing model, a quota limit and an outage", async () => {
    reply = { status: 400, json: { error: { code: 400, message: `API key not valid. ${KEY}`, status: "INVALID_ARGUMENT" } } };
    await fails(503, (e) => assert.match(e.message, /key was rejected/));
    reply = { status: 403, json: { error: { message: "denied" } } };
    await fails(503, (e) => assert.match(e.message, /key was rejected/));
    reply = { status: 404, json: { error: { message: "models/x is not found" } } };
    await fails(503, (e) => assert.match(e.message, /GEMINI_MODEL/));
    reply = { status: 429, json: { error: { message: "quota" } } };
    await fails(429, (e) => assert.ok((e.retryAfterSeconds ?? 0) > 0));
    reply = { status: 503, json: { error: { message: "overloaded" } } };
    await fails(503, (e) => assert.match(e.message, /trouble/));
    reply = { status: 400, json: { error: { message: "something else" } } };
    await fails(502);
  });

  it("handles blocked, cut-off, empty and garbled answers", async () => {
    reply = geminiReply("x", { candidates: [{ finishReason: "SAFETY" }] });
    await fails(422, (e) => assert.match(e.message, /declined/));
    reply = geminiReply("x", { candidates: undefined, promptFeedback: { blockReason: "OTHER" } });
    await fails(422);
    reply = geminiReply("x", { candidates: [{ content: { parts: [{ text: "{\"sub" }] }, finishReason: "MAX_TOKENS" }] });
    await fails(502, (e) => assert.match(e.message, /cut off/));
    reply = geminiReply("x", { candidates: [] });
    await fails(502);
    reply = geminiReply("this is not json");
    await fails(502, (e) => assert.match(e.message, /expected format/));
  });

  it("times out politely and copes with the service being unreachable", async () => {
    env.AI_TIMEOUT_MS = "100";
    reply = { ...geminiReply(good), delayMs: 600 };
    await fails(504);
    delete env.AI_TIMEOUT_MS;
    const real = env.GEMINI_BASE_URL;
    env.GEMINI_BASE_URL = "http://127.0.0.1:9";
    await fails(502);
    env.GEMINI_BASE_URL = real;
  });
});

describe("the route with only a Gemini key", () => {
  const post = (payload: unknown) =>
    POST(new Request("http://localhost/api/ai/draft", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "8.8.8.8" }, body: JSON.stringify(payload) }));

  it("reports the provider without revealing the key, and writes a draft", async () => {
    const info = (await (await GET()).json()) as Record<string, unknown>;
    assert.deepEqual(info, { configured: true, provider: "gemini", model: "default" });
    assert.ok(!JSON.stringify(info).includes(KEY));
    const res = await post(body());
    assert.equal(res.status, 200);
    const out = await res.json();
    assert.equal(out.subject, good.subject);
    assert.ok(!JSON.stringify(out).includes(KEY));
    assert.equal(fake.requests.length, 1);
  });

  it("says no AI is set up when neither key exists", async () => {
    delete env.GEMINI_API_KEY;
    const res = await post(body());
    assert.equal(res.status, 503);
    assert.match(((await res.json()) as { error: string }).error, /GEMINI_API_KEY/);
    assert.equal(fake.requests.length, 0);
  });
});
