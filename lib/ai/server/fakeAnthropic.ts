import http from "node:http";
import type { AddressInfo } from "node:net";

// A pretend Anthropic API for tests, so we can check exactly what our server
// sends and how it copes with every kind of answer, without a real key or any cost.

export type Recorded = { method: string; url: string; headers: http.IncomingHttpHeaders; body: Record<string, unknown> };
export type Reply = { status?: number; headers?: Record<string, string>; json?: unknown; delayMs?: number; raw?: string };

export function messageReply(content: unknown, extra: Record<string, unknown> = {}): Reply {
  return {
    json: {
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [{ type: "text", text: typeof content === "string" ? content : JSON.stringify(content) }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
      ...extra,
    },
  };
}

export async function startFakeAnthropic(respond: (rec: Recorded) => Reply | Promise<Reply>) {
  const requests: Recorded[] = [];
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(raw);
    } catch {
      /* not JSON */
    }
    const rec = { method: req.method ?? "", url: req.url ?? "", headers: req.headers, body };
    requests.push(rec);
    const reply = await respond(rec);
    if (reply.delayMs) await new Promise((r) => setTimeout(r, reply.delayMs));
    res.writeHead(reply.status ?? 200, { "content-type": "application/json", ...(reply.headers ?? {}) });
    res.end(reply.raw ?? JSON.stringify(reply.json ?? {}));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// The same idea for Google Gemini's generateContent answers.
export function geminiReply(content: unknown, extra: Record<string, unknown> = {}): Reply {
  return {
    json: {
      candidates: [{ content: { role: "model", parts: [{ text: typeof content === "string" ? content : JSON.stringify(content) }] }, finishReason: "STOP" }],
      modelVersion: "gemini-test",
      ...extra,
    },
  };
}
