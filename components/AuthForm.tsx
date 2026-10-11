"use client";

import { useState, type FormEvent } from "react";
import Icon from "@/components/Icon";
import { friendlyAuthError } from "@/lib/authMessages";
import { supabase } from "@/lib/supabase";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100";

export default function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    setError("");
    setNotice("");
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    setBusy(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(friendlyAuthError(error.message));
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setError(friendlyAuthError(error.message));
      // With email confirmation on, there is no session until the link is clicked.
      else if (!data.session) setNotice("Check your email for a confirmation link, then log in.");
    }
    setBusy(false);
  }

  const perks = [
    "Checklists and documents for every deal, built for you",
    "Welcome emails and follow-ups drafted in seconds",
    "You approve everything. Nothing is ever sent automatically.",
  ];

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="brand-gradient relative hidden flex-col justify-between overflow-hidden p-16 lg:flex lg:w-1/2">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-rose-400/10 blur-2xl" />
        <div className="relative z-10 flex items-center gap-3 text-white">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
            <Icon name="checklist" className="h-6 w-6" />
          </span>
          <span className="text-xl font-bold tracking-tight">TC Assistant</span>
        </div>
        <div className="relative z-10 max-w-lg space-y-8">
          <h1 className="text-5xl font-bold leading-tight text-white">
            Transaction coordination, with <span className="text-rose-300">less busywork</span>.
          </h1>
          <ul className="space-y-4">
            {perks.map((perk) => (
              <li key={perk} className="flex items-start gap-3 text-lg font-light text-rose-50/85">
                <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-rose-100">
                  <Icon name="check" className="h-3.5 w-3.5" />
                </span>
                {perk}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-sm text-rose-100/50">Your data stays private to your account.</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-white px-6 py-12 lg:p-24">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white">
              <Icon name="checklist" className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight text-indigo-700">TC Assistant</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="mb-8 mt-2 text-slate-500">
            {mode === "login" ? "Log in to your account" : "Set up your private workspace"}
          </p>
          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Email</span>
              <input name="email" type="email" required autoComplete="email" placeholder="name@company.com" className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Password</span>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder="••••••••"
                className={inputClass}
              />
            </label>
            {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}
            {notice && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-indigo-700 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-rose-900/20 hover:bg-indigo-800 disabled:opacity-50"
            >
              {busy ? "One moment…" : mode === "login" ? "Log in" : "Create account"}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-500">
            {mode === "login" ? "New here?" : "Already have an account?"}{" "}
            <button
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError("");
                setNotice("");
              }}
              className="font-bold text-indigo-600 hover:underline"
            >
              {mode === "login" ? "Create an account" : "Log in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
