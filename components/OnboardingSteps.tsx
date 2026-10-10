import Link from "next/link";
import type { OnboardingStatus } from "@/lib/onboarding";

// The three things that make up onboarding, with what is still missing.
// Shown on the Onboarding page and on a deal's Overview.

type StepState = "done" | "todo" | "warn";

function Icon({ state }: { state: StepState }) {
  const style =
    state === "done"
      ? "bg-emerald-100 text-emerald-700"
      : state === "warn"
        ? "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-400";
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${style}`}>
      {state === "done" ? "✓" : state === "warn" ? "!" : "·"}
    </span>
  );
}

export default function OnboardingSteps({ status }: { status: OnboardingStatus }) {
  const { transaction: t, missing, checklistReady, tasks, tasksDone, welcome } = status;
  const importantMissing = missing.some((m) => m.important);

  const steps: { title: string; state: StepState; detail: React.ReactNode }[] = [
    {
      title: "Deal details",
      state: importantMissing ? "warn" : "done",
      detail:
        missing.length === 0 ? (
          "Everything is filled in."
        ) : (
          <>
            <span>Missing information:</span>
            <span className="mt-1 flex flex-wrap gap-1.5">
              {missing.map((m) => (
                <Link
                  key={m.field}
                  href={`/transactions/${t.id}/edit`}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    m.important
                      ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {m.label}
                </Link>
              ))}
            </span>
          </>
        ),
    },
    {
      title: "Onboarding checklist",
      state: checklistReady ? "done" : "todo",
      detail: checklistReady ? `${tasksDone} of ${tasks.length} tasks done.` : "Not generated yet.",
    },
    {
      title: "Welcome email",
      state: welcome === "sent" ? "done" : "todo",
      detail:
        welcome === "sent"
          ? "Marked as sent."
          : welcome === "drafted"
            ? "Draft ready: review it, copy it, and send it from your email app."
            : "Not drafted yet.",
    },
  ];

  return (
    <ol className="space-y-3">
      {steps.map((step) => (
        <li key={step.title} className="flex gap-3">
          <Icon state={step.state} />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-slate-900">{step.title}</p>
            <div className="text-slate-600">{step.detail}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
