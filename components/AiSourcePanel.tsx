import { unverifiedReason } from "@/lib/ai/facts";
import { draftTypeInfo, roleInfo, toneInfo, type AiInfo } from "@/lib/ai/types";

// "Where did this come from?" Shows exactly what the AI was told, so every date,
// name and requirement in the draft can be checked. Built from what we sent, not
// from anything the AI says about itself.

export default function AiSourcePanel({ info }: { info: AiInfo }) {
  const used = new Set(info.usedFactIds);
  const unverifiedUsed = info.facts.filter((f) => f.unverified && used.has(f.id));

  return (
    <div className="space-y-4 rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 text-sm">
      <p className="font-medium text-indigo-900">
        Written with AI · {draftTypeInfo[info.draftType].label} · {toneInfo[info.tone].label} tone · to {roleInfo[info.recipientRole].label.toLowerCase()}
      </p>
      <p className="text-slate-700">
        The AI can make mistakes. Check every date, name and amount against the source information below before you use
        this.
      </p>

      {info.warnings.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="font-medium text-amber-900">Details not found in the source information</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-900">
            {info.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {info.missingInfo.length > 0 && (
        <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3">
          <p className="font-medium text-rose-900">Still needed from you</p>
          <p className="text-rose-800">
            The AI left gaps marked [ADD: …] rather than guess. Fill them in before approving.
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-rose-900">
            {info.missingInfo.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {unverifiedUsed.length > 0 && (
        <div className="rounded-lg border border-slate-300 bg-white p-3 text-slate-700">
          <p className="font-medium text-slate-900">Unverified: confirm before sending</p>
          <p>
            {unverifiedUsed.length} detail{unverifiedUsed.length === 1 ? "" : "s"} in this draft come from your records,
            not the signed contract. The wording asks the reader to confirm them.
          </p>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Source information</p>
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {info.facts.map((f) => (
            <li key={f.id} className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 ${used.has(f.id) ? "" : "text-slate-400"}`}>
              <span className="w-44 shrink-0 text-xs uppercase tracking-wide">{f.label}</span>
              <span className={`min-w-0 flex-1 ${used.has(f.id) ? "text-slate-900" : ""}`}>{f.value}</span>
              <span className="text-xs text-slate-500">{f.source}</span>
              {f.unverified ? (
                <span title={unverifiedReason(f)} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  Unverified
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {f.source.startsWith("Your") ? "You provided" : "From your records"}
                </span>
              )}
              {!used.has(f.id) && <span className="text-xs">not used</span>}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          This is everything the AI was told. Phone numbers, email addresses, the price and your private notes are never sent.
          {info.instructions && (
            <>
              {" "}
              Your instructions: “{info.instructions}”
            </>
          )}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Model: {info.model} · {new Date(info.generatedAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
