"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import Icon from "@/components/Icon";

// The bar across the top of every page: a friendly greeting, the date, and the
// two things you do most.
export default function TopBar({ email }: { email?: string }) {
  // Time-based text comes from the visitor's own clock. On the server there is
  // no visitor yet, so it starts as a neutral greeting and fills in once loaded.
  const clock = useSyncExternalStore(
    () => () => {},
    () => {
      const d = new Date();
      return `${d.getHours()}|${d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`;
    },
    () => "",
  );
  const [hourText, date] = clock.split("|");
  const hour = Number(hourText);
  const greeting = !clock ? "Welcome back" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  // The dashboard and the form already have this button right there.
  const pathname = usePathname();
  const showNew = !["/", "/transactions", "/transactions/new"].includes(pathname);
  const initial = (email?.[0] ?? "D").toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-slate-100 bg-white/85 px-6 backdrop-blur md:h-20 md:px-10">
      <div className="min-w-0">
        <p className="truncate text-base font-bold tracking-tight text-slate-900 md:text-lg">{greeting}</p>
        <p className="min-h-4 truncate text-xs text-slate-400">{date ?? " "}</p>
      </div>
      <div className="flex items-center gap-3">
        {showNew && (
          <Link
            href="/transactions/new"
            className="hidden items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 sm:flex"
          >
            <Icon name="plus" className="h-4 w-4" />
            New transaction
          </Link>
        )}
        <span
          title={email ?? "Demo mode: data stays in this browser"}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700 ring-2 ring-white"
        >
          {initial}
        </span>
      </div>
    </header>
  );
}
