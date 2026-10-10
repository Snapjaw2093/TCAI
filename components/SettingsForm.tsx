"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";
import { ErrorPanel, Loading } from "@/components/LoadState";
import { useToast } from "@/components/ToastProvider";
import { db, usingSupabase } from "@/lib/data";
import { clearLocalDatabase, readLocalDatabase } from "@/lib/data/localStore";
import { importDatabase } from "@/lib/data/supabaseStore";
import { supabase } from "@/lib/supabase";
import { buildSignature } from "@/lib/templates/emails";
import { defaultTaskCategories, type Settings, type TransactionType } from "@/lib/types";
import { useLoad } from "@/lib/useLoad";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const card = "space-y-4 rounded-xl border border-slate-200 bg-white p-6";

export default function SettingsForm() {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  // How many deals are saved in this browser (only checked when using Supabase).
  const [browserDeals, setBrowserDeals] = useState(0);

  const loader = useCallback(async () => {
    const settings = await db.getSettings();
    setDraft((d) => d ?? settings); // keep edits if the page reloads in the background
    if (usingSupabase) setBrowserDeals(readLocalDatabase()?.transactions.length ?? 0);
    return settings;
  }, []);
  const { data: saved, error, loading, reload } = useLoad(loader);
  const [justSaved, setJustSaved] = useState<Settings | null>(null);

  if (error && !saved) return <ErrorPanel message={error} onRetry={reload} />;
  if (loading || !saved || !draft) return <Loading label="Loading settings…" />;

  const baseline = justSaved ?? saved;
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft({ ...draft, [key]: value });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    // Tidy the category list: trimmed, no blanks, no repeats.
    const categories = [...new Set(draft.taskCategories.map((c) => c.trim()).filter(Boolean))];
    const next = { ...draft, taskCategories: categories.length ? categories : defaultTaskCategories };
    setSaving(true);
    try {
      await db.saveSettings(next);
      setDraft(next);
      setJustSaved(next);
      toast("Settings saved. New drafts and deals will use them.");
    } catch (err) {
      toast(`Couldn't save: ${err instanceof Error ? err.message : "unknown error"}`, "error");
    }
    setSaving(false);
  }

  function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    if (draft!.taskCategories.some((c) => c.toLowerCase() === name.toLowerCase())) {
      toast(`“${name}” is already in the list.`, "error");
      return;
    }
    set("taskCategories", [...draft!.taskCategories, name]);
    setNewCategory("");
  }

  async function handleImport() {
    const local = readLocalDatabase();
    if (!local) return;
    if (
      !window.confirm(
        `Copy ${local.transactions.length} deal(s) from this browser into your account? They will be removed from this browser afterwards.`,
      )
    )
      return;
    try {
      await importDatabase(local);
      clearLocalDatabase();
      setBrowserDeals(0);
      toast("Imported. Your deals are now saved in your account.");
    } catch (e) {
      toast(`Import failed: ${e instanceof Error ? e.message : "unknown error"}`, "error");
    }
  }

  // Asks the server for a file of everything in this account. The server checks the login itself.
  async function handleExport() {
    try {
      const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const token = data.session?.access_token;
      if (!token) throw new Error("Please log in again.");
      const res = await fetch("/api/account/export", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "The download failed.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "tc-assistant-export.json";
      a.click();
      URL.revokeObjectURL(url);
      toast("Your data was downloaded.");
    } catch (e) {
      toast(`Couldn't download: ${e instanceof Error ? e.message : "unknown error"}`, "error");
    }
  }

  async function handleReset() {
    // With a real account this deletes real deals, so make the user type a word.
    if (usingSupabase) {
      const answer = window.prompt(
        "This DELETES every transaction, task, document and draft in your account and replaces them with two sample deals. Your signature and templates are kept.\n\nType DELETE to continue.",
      );
      if (answer?.trim() !== "DELETE") return;
    } else if (
      !window.confirm("Replace all transactions, tasks, documents and drafts with the sample data? This can't be undone.")
    ) {
      return;
    }
    try {
      await db.resetToSampleData();
      toast("Sample data loaded.");
      router.push("/");
    } catch (e) {
      toast(`Couldn't reset: ${e instanceof Error ? e.message : "unknown error"}`, "error");
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="space-y-8">
        <section className={card}>
          <h2 className="font-medium text-slate-900">Your email signature</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Your name</span>
              <input value={draft.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Title</span>
              <input value={draft.title} onChange={(e) => set("title", e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Company (optional)</span>
              <input value={draft.company} onChange={(e) => set("company", e.target.value)} className={inputClass} />
            </label>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Preview</p>
            <pre className="rounded-lg bg-slate-50 p-3 font-mono text-sm text-slate-700">{buildSignature(draft)}</pre>
          </div>
          <p className="text-xs text-slate-500">Drafts you&apos;ve already created keep their old signature.</p>
        </section>

        <section className={card}>
          <h2 className="font-medium text-slate-900">Defaults</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">New transactions start as</span>
              <select
                value={draft.defaultTransactionType}
                onChange={(e) => set("defaultTransactionType", e.target.value as TransactionType)}
                className={inputClass}
              >
                <option value="buyer">Buyer side</option>
                <option value="seller">Seller side</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Look ahead for follow-ups</span>
              <select
                value={draft.followUpDays}
                onChange={(e) => set("followUpDays", Number(e.target.value))}
                className={inputClass}
              >
                {[3, 7, 14, 30].map((n) => (
                  <option key={n} value={n}>
                    {n} days
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-slate-500">
            Transaction types are buyer and seller. Each has its own checklist under the Templates tab.
          </p>
        </section>

        <section className={card}>
          <h2 className="font-medium text-slate-900">Task categories</h2>
          <p className="text-sm text-slate-500">
            Labels you can put on checklist tasks (set them on the Templates tab). Renaming a category here doesn&apos;t
            change tasks already on your deals.
          </p>
          <ul className="space-y-2">
            {draft.taskCategories.map((category, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  value={category}
                  onChange={(e) =>
                    set("taskCategories", draft.taskCategories.map((c, j) => (j === i ? e.target.value : c)))
                  }
                  aria-label="Category name"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => set("taskCategories", draft.taskCategories.filter((_, j) => j !== i))}
                  aria-label={`Remove ${category}`}
                  className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCategory();
                }
              }}
              placeholder="New category"
              aria-label="New category"
              className={inputClass}
            />
            <button
              type="button"
              onClick={addCategory}
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Add
            </button>
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!dirty || saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
          {dirty && <span className="text-sm text-amber-700">Unsaved changes</span>}
        </div>
      </form>

      {usingSupabase && browserDeals > 0 && (
        <section className={card}>
          <h2 className="font-medium text-slate-900">Data saved in this browser</h2>
          <p className="text-sm text-slate-500">
            {browserDeals} deal{browserDeals === 1 ? "" : "s"} from before you had an account
            {browserDeals === 1 ? " is" : " are"} still saved in this browser. Copy
            {browserDeals === 1 ? " it" : " them"} into your account to keep
            {browserDeals === 1 ? " it" : " them"}. This may include the sample deals.
          </p>
          <button
            onClick={handleImport}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Import into my account
          </button>
        </section>
      )}

      {usingSupabase && (
        <section className={card}>
          <h2 className="font-medium text-slate-900">Download my data</h2>
          <p className="text-sm text-slate-500">A file with every deal, contact, task, document and email draft in your account.</p>
          <button
            onClick={handleExport}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Download my data
          </button>
        </section>
      )}

      <section className={card}>
        <h2 className="font-medium text-slate-900">Sample data</h2>
        <p className="text-sm text-slate-500">
          {usingSupabase
            ? "Replaces ALL of your transactions with two made-up sample deals. Only use this on a test account. Your signature and templates are kept."
            : "Replace everything with the two sample deals. Your signature and templates are kept."}
        </p>
        <button
          onClick={handleReset}
          className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
        >
          Reset to sample data
        </button>
      </section>
    </div>
  );
}
