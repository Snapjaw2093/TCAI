"use client";

import type { Session } from "@supabase/supabase-js";
import { Suspense, useEffect, useState } from "react";
import AuthForm from "@/components/AuthForm";
import Sidebar from "@/components/Sidebar";
import { db, usingSupabase } from "@/lib/data";
import { schemaUpdateSql } from "@/lib/schemaUpdateSql";
import { supabase } from "@/lib/supabase";

// Wraps the whole app. With Supabase on, you see the login screen until you
// are signed in. With it off (no settings), the app opens straight away.
// The real protection is in the database (see supabase/schema.sql): this
// screen only decides what to show.

function Shell({ email, children }: { email?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen md:flex">
      <Suspense fallback={<div className="md:w-60" />}>
        <Sidebar
          email={email}
          onSignOut={email ? () => supabase?.auth.signOut() : undefined}
        />
      </Suspense>
      <main className="flex-1 p-6 md:p-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(
    usingSupabase ? undefined : null,
  );
  // Parts of the database that are missing, or an error reaching it.
  const [missing, setMissing] = useState<string[]>([]);
  const [setupError, setSetupError] = useState("");
  const [copied, setCopied] = useState(false);
  const [attempt, setAttempt] = useState(0); // bumped by "Try again"

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  // After logging in, make sure the database has everything this version needs.
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    async function check() {
      try {
        setMissing(await db.checkSchema());
        setSetupError("");
      } catch (e) {
        setSetupError(e instanceof Error ? e.message : "Unknown error");
      }
    }
    check();
  }, [userId, attempt]);

  if (!usingSupabase) return <Shell>{children}</Shell>;
  if (session === undefined) return <Message>Loading…</Message>;
  if (!session) return <AuthForm />;

  if (missing.length > 0) {
    return (
      <Message>
        <div className="w-full max-w-lg space-y-3 text-left">
          <p className="text-center font-medium text-slate-900">Your database needs a quick update</p>
          <p>
            This version of TC Assistant uses a few things your database doesn&apos;t have yet
            ({missing.join(", ")}). In Supabase, open <strong>SQL Editor</strong>, start a new query, paste
            this in, and click <strong>Run</strong>. It&apos;s safe to run more than once. Then refresh this page.
          </p>
          <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
            {schemaUpdateSql}
          </pre>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(schemaUpdateSql);
                setCopied(true);
              } catch {
                // clipboard blocked: the text above can still be selected by hand
              }
            }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {copied ? "Copied!" : "Copy the SQL"}
          </button>
        </div>
      </Message>
    );
  }

  if (setupError) {
    return (
      <Message>
        <div className="max-w-md space-y-2">
          <p className="font-medium text-slate-900">Can&apos;t reach the database</p>
          <p>Check your connection, then try again.</p>
          <p className="text-xs text-slate-400">{setupError}</p>
          <button
            onClick={() => {
              setSetupError("");
              setAttempt((n) => n + 1);
            }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Try again
          </button>
        </div>
      </Message>
    );
  }

  return <Shell email={session.user.email}>{children}</Shell>;
}
