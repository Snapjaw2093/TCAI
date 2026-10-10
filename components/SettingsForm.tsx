"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { db } from "@/lib/data";
import { buildSignature } from "@/lib/templates/emails";
import type { Settings } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export default function SettingsForm() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      setSettings(await db.getSettings());
    }
    load();
  }, []);

  if (!settings) return <p className="text-sm text-slate-500">Loading…</p>;

  const update = (key: keyof Settings, value: string) => {
    setSaved(false);
    setSettings({ ...settings, [key]: value });
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await db.saveSettings(settings!);
    setSaved(true);
  }

  async function handleReset() {
    if (
      !window.confirm(
        "Replace all transactions, tasks, documents and drafts with the sample data? This can't be undone.",
      )
    )
      return;
    await db.resetToSampleData();
    router.push("/");
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
      >
        <h2 className="font-medium text-slate-900">Your email signature</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Your name</span>
            <input
              value={settings.name}
              onChange={(e) => update("name", e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Title</span>
            <input
              value={settings.title}
              onChange={(e) => update("title", e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Company (optional)
            </span>
            <input
              value={settings.company}
              onChange={(e) => update("company", e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            Preview
          </p>
          <pre className="rounded-lg bg-slate-50 p-3 font-mono text-sm text-slate-700">
            {buildSignature(settings)}
          </pre>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Save
          </button>
          {saved && <span className="text-sm text-emerald-700">Saved. New drafts will use this.</span>}
        </div>
        <p className="text-xs text-slate-500">
          Drafts you&apos;ve already created keep their old signature.
        </p>
      </form>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-medium text-slate-900">Sample data</h2>
        <p className="mt-1 text-sm text-slate-500">
          Replace everything with the two sample deals. Your signature is kept.
        </p>
        <button
          onClick={handleReset}
          className="mt-4 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
        >
          Reset to sample data
        </button>
      </section>
    </div>
  );
}
