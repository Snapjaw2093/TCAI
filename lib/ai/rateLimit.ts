// Basic protection against running up the AI bill: a limit per person per
// minute and per day, plus a cap on the whole app per day.
//
// This is kept in the server's memory. That is simple and good enough to stop
// accidents and casual abuse, but on a host that runs several copies of the app
// each copy counts separately, and a restart clears the counts. For a hard
// guarantee, also set a monthly spend limit in the Anthropic console.

type Hits = number[];

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const GLOBAL_KEY = "__everyone__";

const store = new Map<string, Hits>();

const intFromEnv = (name: string, fallback: number) => {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function limitSettings() {
  return {
    perMinute: intFromEnv("AI_RATE_LIMIT_PER_MINUTE", 6),
    perDay: intFromEnv("AI_RATE_LIMIT_PER_DAY", 60),
    globalPerDay: intFromEnv("AI_GLOBAL_DAILY_LIMIT", 500),
  };
}

export type LimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number; scope: "minute" | "day" | "everyone" };

function recent(key: string, now: number): Hits {
  const hits = (store.get(key) ?? []).filter((t) => now - t < DAY);
  store.set(key, hits);
  return hits;
}

// Call once per request that is about to use the AI. Counts the request if allowed.
export function checkRateLimit(key: string, now: number = Date.now()): LimitResult {
  const { perMinute, perDay, globalPerDay } = limitSettings();
  const hits = recent(key, now);
  const global = recent(GLOBAL_KEY, now);

  const lastMinute = hits.filter((t) => now - t < MINUTE);
  if (lastMinute.length >= perMinute) {
    return { ok: false, scope: "minute", retryAfterSeconds: Math.max(1, Math.ceil((lastMinute[0] + MINUTE - now) / 1000)) };
  }
  if (hits.length >= perDay) {
    return { ok: false, scope: "day", retryAfterSeconds: Math.max(1, Math.ceil((hits[0] + DAY - now) / 1000)) };
  }
  if (global.length >= globalPerDay) {
    return { ok: false, scope: "everyone", retryAfterSeconds: Math.max(1, Math.ceil((global[0] + DAY - now) / 1000)) };
  }

  hits.push(now);
  global.push(now);

  // Don't let the map grow forever.
  if (store.size > 5000) {
    for (const [k, v] of store) if (v.length === 0 || now - v[v.length - 1] > DAY) store.delete(k);
  }
  return { ok: true };
}

// For tests.
export function resetRateLimits() {
  store.clear();
}
