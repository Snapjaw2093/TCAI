"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { AiRequestError, fetchAiConfigured, requestAiDraft } from "@/lib/ai/client";
import { buildFacts, deadlineCandidates, defaultInclude, unverifiedReason, type Include } from "@/lib/ai/facts";
import {
  aiLimits,
  draftTypeInfo,
  draftTypes,
  recipientRoles,
  roleInfo,
  toneInfo,
  tones,
  type AiDraftType,
  type AiInfo,
  type AiRecipientRole,
  type AiTone,
} from "@/lib/ai/types";
import { createAiDraft } from "@/lib/data/drafts";
import { formatDate } from "@/lib/format";
import { buildSignature } from "@/lib/templates/emails";
import type { DocumentItem, EmailDraft, Person, Settings, Task, Transaction } from "@/lib/types";

const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const label = "mb-1 block text-sm font-medium text-slate-700";

const INCLUDE_LABELS: Record<keyof Include, string> = {
  dates: "Contract and closing dates",
  documents: "Documents still outstanding",
  openTasks: "Open tasks (next due)",
  completedTasks: "Completed tasks",
};

const instructionLabel: Record<AiDraftType, string> = {
  welcome: "Anything to add? (optional)",
  "missing-documents": "Anything to add? (optional)",
  "signature-reminder": "How should they sign? (optional)",
  "deadline-reminder": "Anything to add? (optional)",
  "status-update": "Anything to add? (optional)",
  custom: "What should the email say?",
};

export default function AiDraftPanel({
  transactions,
  people,
  tasks,
  documents,
  settings,
  onCreated,
  onClose,
}: {
  transactions: Transaction[];
  people: Person[];
  tasks: Task[];
  documents: DocumentItem[];
  settings: Settings;
  onCreated: (draft: EmailDraft) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const today = useMemo(() => new Date(), []);

  const [dealId, setDealId] = useState(transactions[0]?.id ?? "");
  const [draftType, setDraftType] = useState<AiDraftType>("welcome");
  const [role, setRole] = useState<AiRecipientRole>("client");
  const [tone, setTone] = useState<AiTone>("friendly");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [instructions, setInstructions] = useState("");
  const [extraText, setExtraText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [picks, setPicks] = useState<Record<string, boolean>>({});
  const [includeOverride, setIncludeOverride] = useState<Partial<Include>>({});

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [serverMissing, setServerMissing] = useState<string[]>([]);
  // A short pause after each request (and longer if the server says to wait).
  const [cooling, setCooling] = useState(false);
  const coolTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    async function check() {
      const ok = await fetchAiConfigured();
      if (alive) setConfigured(ok);
    }
    check();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (coolTimer.current) clearTimeout(coolTimer.current);
    },
    [],
  );

  const deal = transactions.find((t) => t.id === dealId);
  const client = people.find((p) => p.id === deal?.clientId);
  const agent = people.find((p) => p.id === deal?.agentId);
  const dealTasks = tasks.filter((t) => t.transactionId === dealId);
  const dealDocs = documents.filter((d) => d.transactionId === dealId);
  const include: Include = { ...defaultInclude(draftType), ...includeOverride };
  const outstanding = dealDocs.filter((d) => d.status !== "received");
  const candidates = deal ? deadlineCandidates(deal, dealTasks, dealDocs, today, 30) : [];

  const extraItems = extraText
    .split("\n")
    .map((l) => l.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 10);

  const built = useMemo(() => {
    if (!deal) return { facts: [], recipientName: null, problems: ["Pick a transaction."] };
    return buildFacts({
      draftType,
      recipientRole: role,
      recipientName,
      transaction: deal,
      client,
      agent,
      tasks: dealTasks,
      documents: dealDocs,
      include,
      pickedDocumentIds:
        draftType === "missing-documents"
          ? outstanding.filter((d) => picks[d.id] ?? true).map((d) => d.id)
          : dealDocs.filter((d) => picks[d.id] ?? false).map((d) => d.id),
      pickedDeadlineIds: candidates.filter((c) => picks[c.id] ?? true).map((c) => c.id),
      extraItems,
      instructions,
      confirmed,
      today,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal, draftType, role, recipientName, client, agent, tasks, documents, includeOverride, picks, extraText, instructions, confirmed, today]);

  const needsName = role !== "client" && role !== "agent";
  const blocked = busy || cooling || built.problems.length > 0 || configured === false;

  function cooldown(ms: number) {
    if (coolTimer.current) clearTimeout(coolTimer.current);
    setCooling(true);
    coolTimer.current = setTimeout(() => setCooling(false), ms);
  }

  // Changing the deal or the kind of email starts the choices fresh.
  const changeDeal = (id: string) => {
    setDealId(id);
    setPicks({});
    setExtraText("");
    setServerMissing([]);
    setError("");
  };
  const changeType = (type: AiDraftType) => {
    setDraftType(type);
    setPicks({});
    setIncludeOverride({});
    setExtraText("");
    setServerMissing([]);
    setError("");
  };

  async function generate() {
    if (!deal || blocked) return;
    setBusy(true);
    setError("");
    setServerMissing([]);
    try {
      const result = await requestAiDraft({
        draftType,
        tone,
        recipientRole: role,
        recipientName: built.recipientName,
        instructions: instructions.trim(),
        confirmed,
        facts: built.facts,
      });
      const info: AiInfo = {
        draftType,
        tone,
        recipientRole: role,
        instructions: instructions.trim(),
        confirmed,
        facts: built.facts,
        usedFactIds: result.usedFactIds,
        missingInfo: result.missingInfo,
        warnings: result.warnings,
        model: result.model,
        generatedAt: new Date().toISOString(),
      };
      const person = role === "client" ? client : role === "agent" ? agent : undefined;
      const draft = await createAiDraft(
        deal.id,
        person ?? null,
        person ? person.email : recipientEmail.trim(),
        { subject: result.subject, body: `${result.body}\n\n${buildSignature(settings)}` },
        info,
      );
      const flagged = result.warnings.length + result.missingInfo.length;
      toast(
        flagged > 0
          ? `AI draft created. ${flagged} thing${flagged === 1 ? "" : "s"} to check before you use it.`
          : "AI draft created. Check the details against the source before you use it.",
      );
      onCreated(draft);
    } catch (e) {
      if (e instanceof AiRequestError) {
        if (e.missing.length > 0) setServerMissing(e.missing);
        setError(e.message);
        if (e.status === 429) {
          cooldown((e.retryAfterSeconds ?? 30) * 1000);
          setBusy(false);
          return;
        }
      } else {
        setError(e instanceof Error ? e.message : "Couldn't create the draft.");
      }
    }
    setBusy(false);
    // A short pause between drafts so a double-click can't draft twice.
    cooldown(3000);
  }

  if (transactions.length === 0) {
    return (
      <div id="ai-compose" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        Create a transaction first, then you can draft emails for it.{" "}
        <button onClick={onClose} className="text-indigo-600 hover:underline">Close</button>
      </div>
    );
  }

  return (
    <div id="ai-compose" className="space-y-5 rounded-xl border border-indigo-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium text-slate-900">Draft with AI</h2>
          <p className="text-sm text-slate-500">
            The AI writes a first draft from the details below. You edit it, check it, and send it yourself. Nothing is sent
            automatically.
          </p>
        </div>
        <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-900">Close</button>
      </div>

      {configured === false && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">AI drafting isn&apos;t set up yet.</p>
          <p>
            The site owner needs to add an <code>ANTHROPIC_API_KEY</code> (see the README, “AI drafting”). You can still use
            “New email” to fill in your templates.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className={label}>Transaction</span>
          <select value={dealId} onChange={(e) => changeDeal(e.target.value)} className={field} aria-label="Transaction">
            {transactions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.propertyAddress} · {people.find((p) => p.id === t.clientId)?.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Kind of email</span>
          <select value={draftType} onChange={(e) => changeType(e.target.value as AiDraftType)} className={field} aria-label="Kind of email">
            {draftTypes.map((t) => (
              <option key={t} value={t}>{draftTypeInfo[t].label}</option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-500">{draftTypeInfo[draftType].help}</span>
        </label>
        <label className="block">
          <span className={label}>Who is it to?</span>
          <select value={role} onChange={(e) => setRole(e.target.value as AiRecipientRole)} className={field} aria-label="Recipient role">
            {recipientRoles.map((r) => (
              <option key={r} value={r}>
                {roleInfo[r].label}
                {r === "client" && client ? ` (${client.name})` : r === "agent" && agent ? ` (${agent.name})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Tone</span>
          <select value={tone} onChange={(e) => setTone(e.target.value as AiTone)} className={field} aria-label="Tone">
            {tones.map((t) => (
              <option key={t} value={t}>{toneInfo[t].label}</option>
            ))}
          </select>
        </label>
        {needsName && (
          <>
            <label className="block">
              <span className={label}>Their name</span>
              <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} maxLength={aiLimits.maxName} className={field} aria-label="Recipient name" />
            </label>
            <label className="block md:col-start-2">
              <span className={label}>Their email (you can add it later)</span>
              <input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} type="email" className={field} aria-label="Recipient email" />
              <span className="mt-1 block text-xs text-slate-500">Used only for the To line. It is never sent to the AI.</span>
            </label>
          </>
        )}
      </div>

      {draftType === "missing-documents" && (
        <fieldset className="space-y-2">
          <legend className={label}>Which documents are still needed?</legend>
          {outstanding.length === 0 && <p className="text-sm text-slate-500">Nothing outstanding on the checklist. Type documents below instead.</p>}
          {outstanding.map((d) => (
            <label key={d.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={picks[d.id] ?? true} onChange={(e) => setPicks({ ...picks, [d.id]: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
              {d.name}
              {d.dueDate && <span className="text-xs text-slate-500">due {formatDate(d.dueDate)}</span>}
            </label>
          ))}
          <label className="block">
            <span className="text-xs text-slate-500">Other documents, one per line (optional)</span>
            <textarea value={extraText} onChange={(e) => setExtraText(e.target.value)} rows={2} className={field} aria-label="Other documents" />
          </label>
        </fieldset>
      )}

      {draftType === "signature-reminder" && (
        <fieldset className="space-y-2">
          <legend className={label}>Which documents are waiting for a signature?</legend>
          <p className="text-xs text-slate-500">TC Assistant doesn&apos;t track signatures, so tell us which ones.</p>
          {dealDocs.map((d) => (
            <label key={d.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={picks[d.id] ?? false} onChange={(e) => setPicks({ ...picks, [d.id]: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
              {d.name}
            </label>
          ))}
          <label className="block">
            <span className="text-xs text-slate-500">Other documents, one per line (optional)</span>
            <textarea value={extraText} onChange={(e) => setExtraText(e.target.value)} rows={2} className={field} aria-label="Other documents" />
          </label>
        </fieldset>
      )}

      {draftType === "deadline-reminder" && (
        <fieldset className="space-y-2">
          <legend className={label}>Which deadlines should the email mention?</legend>
          {candidates.length === 0 && <p className="text-sm text-slate-500">No dated items in the next 30 days on this deal&apos;s checklist.</p>}
          {candidates.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={picks[c.id] ?? true} onChange={(e) => setPicks({ ...picks, [c.id]: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
              {c.title}
              <span className={`text-xs ${c.daysUntil < 0 ? "text-rose-600" : "text-slate-500"}`}>{formatDate(c.dueDate)}</span>
            </label>
          ))}
        </fieldset>
      )}

      {(draftType === "welcome" || draftType === "status-update" || draftType === "custom") && (
        <fieldset className="space-y-2">
          <legend className={label}>Details the AI may use</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(INCLUDE_LABELS) as (keyof Include)[]).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={include[k]}
                  onChange={(e) => setIncludeOverride({ ...includeOverride, [k]: e.target.checked })}
                  className="h-4 w-4 accent-indigo-600"
                />
                {INCLUDE_LABELS[k]}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label className="block">
        <span className={label}>{instructionLabel[draftType]}</span>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={draftType === "custom" ? 4 : 2}
          maxLength={aiLimits.maxInstructions}
          placeholder={draftType === "custom" ? "e.g. Ask whether the walkthrough time on Thursday still works, and thank them for the quick turnaround." : "Any detail you want included. Whatever you type is treated as true."}
          className={field}
          aria-label="Instructions"
        />
        <span className="mt-1 block text-xs text-slate-500">{instructions.length}/{aiLimits.maxInstructions}. The AI uses only what you give it here and below. If it needs something else, it will leave a gap for you.</span>
      </label>

      <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
        <span>
          I&apos;ve checked the contract and closing dates, and which documents are required, against the signed contract.
          <span className="block text-xs text-slate-500">
            Until you tick this, the AI treats them as unconfirmed and words them cautiously (&quot;our records show… please confirm&quot;).
          </span>
        </span>
      </label>

      <details open className="rounded-lg border border-slate-200">
        <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-slate-800">
          What will be sent to the AI ({built.facts.length} items)
        </summary>
        <ul className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
          {built.facts.map((f) => (
            <li key={f.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2">
              <span className="w-44 shrink-0 text-xs uppercase tracking-wide text-slate-500">{f.label}</span>
              <span className="min-w-0 flex-1 text-slate-900">{f.value}</span>
              <span className="text-xs text-slate-500">{f.source}</span>
              {f.unverified && (
                <span title={unverifiedReason(f)} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Unverified</span>
              )}
            </li>
          ))}
        </ul>
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          Phone numbers, email addresses, the price and your private deal notes are never sent. The AI also gets the
          instructions you typed above.
        </p>
      </details>

      {(built.problems.length > 0 || serverMissing.length > 0) && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Before the AI can draft this</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {[...new Set([...built.problems, ...serverMissing])].map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {error && serverMissing.length === 0 && (
        <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={generate}
          disabled={blocked}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {busy ? "Drafting…" : cooling ? "One moment…" : "Draft with AI"}
        </button>
        {busy && (
          <span role="status" className="flex items-center gap-2 text-sm text-slate-500">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
            Writing your draft. This can take a few seconds.
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500">
        AI can make mistakes. Treat every draft as a starting point: check every date, name and amount before you use it.
      </p>
    </div>
  );
}
