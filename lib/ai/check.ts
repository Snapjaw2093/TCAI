import type { AiDraftRequest } from "@/lib/ai/types";

// After the AI writes a draft, look for details it may have made up. The AI is
// told not to invent anything, but we don't just trust that: dates, times,
// amounts, contact details and promised timeframes in the draft are compared
// with the information we gave it. Anything extra is flagged for the person.

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const MONTH_NAME =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const WORD_DATE = new RegExp(`\\b(${MONTH_NAME})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "gi");
const SLASH_DATE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const WEEKDAY = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi;
const TIME = /\b\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?)\b/gi;
const MONEY = /\$\s?\d[\d,]*(?:\.\d{1,2})?/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE = /\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;
const URL = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const TIMEFRAME = /\b(?:within|in|by)\s+(?:the\s+next\s+)?\d+\s+(?:business\s+|working\s+)?(?:hours?|days?|weeks?)\b/gi;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

type DateKey = { md: string; full: string | null; text: string };

// Every date written in a piece of text, as month-day (and year when given).
function datesIn(text: string): DateKey[] {
  const out: DateKey[] = [];
  for (const m of text.matchAll(WORD_DATE)) {
    const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
    out.push({ md: `${month}-${Number(m[2])}`, full: m[3] ? `${month}-${Number(m[2])}-${m[3]}` : null, text: m[0] });
  }
  for (const m of text.matchAll(ISO_DATE)) {
    out.push({ md: `${Number(m[2])}-${Number(m[3])}`, full: `${Number(m[2])}-${Number(m[3])}-${m[1]}`, text: m[0] });
  }
  for (const m of text.matchAll(SLASH_DATE)) {
    const year = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : null;
    out.push({ md: `${Number(m[1])}-${Number(m[2])}`, full: year ? `${Number(m[1])}-${Number(m[2])}-${year}` : null, text: m[0] });
  }
  return out;
}

// Everything the AI was legitimately given, as one searchable block of text.
export function allowedText(req: AiDraftRequest): string {
  return [
    ...req.facts.map((f) => `${f.label} ${f.value}`),
    req.instructions,
    req.recipientName ?? "",
  ].join("\n");
}

// Details in `text` that the allowed text doesn't contain. Returns plain-English warnings.
export function findUnsupportedDetails(text: string, allowed: string): string[] {
  const found = new Set<string>();
  const allowedNorm = norm(allowed);
  const flag = (shown: string) => found.add(shown.trim());

  // Dates: a date is fine if the same month and day (and year, when written) is in the source.
  const okDates = datesIn(allowed);
  for (const d of datesIn(text)) {
    const known = d.full
      ? okDates.some((o) => o.full === d.full)
      : okDates.some((o) => o.md === d.md);
    if (!known) flag(d.text);
  }

  // Everything else must appear in the source text, word for word.
  for (const pattern of [WEEKDAY, TIME, MONEY, EMAIL, PHONE, URL, TIMEFRAME]) {
    for (const m of text.matchAll(pattern)) {
      if (!allowedNorm.includes(norm(m[0]))) flag(m[0]);
    }
  }

  return [...found].map(
    (shown) => `"${shown}" isn't in the source information. Check it, or remove it.`,
  );
}

// The gaps the AI left for you: [ADD: closing time]
export function extractGaps(text: string): string[] {
  return [...text.matchAll(/\[ADD:\s*([^\]]+)\]/gi)].map((m) => m[1].trim());
}

export const hasGaps = (text: string) => /\[ADD:[^\]]*\]/i.test(text);

// The app adds the signature, so remove a sign-off if the AI wrote one anyway:
// a short closing line ("Best regards,") plus a name, at the very end.
export function stripSignOff(body: string): string {
  const lines = body.replace(/\s+$/, "").split("\n");
  const closers = /^(best|kind|warm|warmest|sincerely|regards|thanks|thank you|cheers|many thanks|respectfully|yours)\b[^.!?]{0,30}[,.!]?$/i;
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
    if (closers.test(lines[i].trim())) {
      const after = lines.slice(i + 1).filter((l) => l.trim());
      // Only a short name/title block may follow it.
      if (after.length <= 3 && after.every((l) => l.length <= 60)) {
        return lines.slice(0, i).join("\n").replace(/\s+$/, "");
      }
    }
  }
  return lines.join("\n");
}
