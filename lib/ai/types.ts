// Shared by the screen that asks for an AI draft and the server route that
// writes it. Keeping the two sides on one set of types means they can't drift.

export const draftTypes = [
  "welcome",
  "missing-documents",
  "signature-reminder",
  "deadline-reminder",
  "status-update",
  "custom",
] as const;
export type AiDraftType = (typeof draftTypes)[number];

export const tones = ["friendly", "professional", "concise", "formal", "reassuring", "firm"] as const;
export type AiTone = (typeof tones)[number];

export const recipientRoles = ["client", "agent", "lender", "title-escrow", "other"] as const;
export type AiRecipientRole = (typeof recipientRoles)[number];

export const draftTypeInfo: Record<AiDraftType, { label: string; help: string }> = {
  welcome: { label: "Welcome & onboarding", help: "Introduce yourself and what happens next." },
  "missing-documents": { label: "Missing-document reminder", help: "Ask for specific documents that are still outstanding." },
  "signature-reminder": { label: "Signature reminder", help: "Nudge someone to sign specific documents." },
  "deadline-reminder": { label: "Upcoming-deadline reminder", help: "Remind someone about specific upcoming dates." },
  "status-update": { label: "General status update", help: "Summarise where the transaction stands." },
  custom: { label: "Custom (your instructions)", help: "Describe exactly what the email should say." },
};

export const toneInfo: Record<AiTone, { label: string; guide: string }> = {
  friendly: { label: "Friendly", guide: "Warm and approachable, like a helpful colleague. Plain words." },
  professional: { label: "Professional", guide: "Polite, clear and businesslike." },
  concise: { label: "Concise", guide: "As short as possible while staying polite. No filler." },
  formal: { label: "Formal", guide: "Formal and courteous, full sentences, no contractions." },
  reassuring: { label: "Reassuring", guide: "Calm and supportive; acknowledge that the process can feel like a lot." },
  firm: { label: "Firm but polite", guide: "Direct about what is needed and by when, without being rude." },
};

export const roleInfo: Record<AiRecipientRole, { label: string; guide: string }> = {
  client: { label: "Client", guide: "A homebuyer or seller who is not an industry professional. Avoid jargon; explain briefly." },
  agent: { label: "Agent", guide: "A real estate agent who knows the process. Peer to peer, brief and action-oriented." },
  lender: { label: "Lender", guide: "A loan officer or processor. Precise and professional; refer only to the specific request." },
  "title-escrow": { label: "Title / escrow", guide: "A title or escrow officer. Precise and professional; refer only to the specific request." },
  other: { label: "Someone else", guide: "A third party. Neutral and professional." },
};

// One piece of information the AI is allowed to use. The AI sees ONLY these
// (plus your typed instructions). Nothing else about the deal is sent.
export type AiFact = {
  id: string;
  label: string;
  value: string;
  // Where it came from, so you know what to check: "Deal record", "Checklist",
  // "Your selection", "Your input", "Your device clock".
  source: string;
  // True when a human hasn't confirmed it against the contract yet: contract
  // and closing dates, deadlines worked out from them, and which documents
  // are required.
  unverified: boolean;
};

export type AiDraftRequest = {
  draftType: AiDraftType;
  tone: AiTone;
  recipientRole: AiRecipientRole;
  recipientName: string | null;
  instructions: string;
  // The user ticked "I've checked these dates and requirements against the contract".
  confirmed: boolean;
  facts: AiFact[];
};

export type AiDraftResult = {
  subject: string;
  body: string;
  // Things the AI says it needs but wasn't given. The draft holds [ADD: ...] gaps for these.
  missingInfo: string[];
  // Details in the draft that aren't in the source information.
  warnings: string[];
  usedFactIds: string[];
  model: string;
};

// Saved on the draft so the source information stays visible after you leave.
export type AiInfo = {
  draftType: AiDraftType;
  tone: AiTone;
  recipientRole: AiRecipientRole;
  instructions: string;
  confirmed: boolean;
  facts: AiFact[];
  usedFactIds: string[];
  missingInfo: string[];
  warnings: string[];
  model: string;
  generatedAt: string;
};

export const aiLimits = {
  maxFacts: 60,
  maxLabel: 120,
  maxValue: 300,
  maxInstructions: 1500,
  maxName: 80,
  maxBodyChars: 40_000,
} as const;
