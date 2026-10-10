"use client";

import type { Session } from "@supabase/supabase-js";
import { Suspense, useEffect, useState } from "react";
import AuthForm from "@/components/AuthForm";
import Sidebar from "@/components/Sidebar";
import { db, usingSupabase } from "@/lib/data";
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
  const [setupError, setSetupError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  // After logging in, make sure the database tables exist.
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    async function check() {
      try {
        await db.listTransactions();
        setSetupError("");
      } catch (e) {
        setSetupError(e instanceof Error ? e.message : "Unknown error");
      }
    }
    check();
  }, [userId]);

  if (!usingSupabase) return <Shell>{children}</Shell>;
  if (session === undefined) return <Message>Loading…</Message>;
  if (!session) return <AuthForm />;

  if (setupError) {
    return (
      <Message>
        <div className="max-w-md space-y-2">
          <p className="font-medium text-slate-900">The database isn&apos;t ready yet</p>
          <p>
            Run <code>supabase/schema.sql</code> in the Supabase SQL Editor, then refresh this page.
          </p>
          <p className="text-xs text-slate-400">{setupError}</p>
        </div>
      </Message>
    );
  }

  return <Shell email={session.user.email}>{children}</Shell>;
}
