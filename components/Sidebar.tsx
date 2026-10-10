"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "@/components/Icon";

const links: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/transactions", label: "Transactions", icon: "home" },
  { href: "/onboarding", label: "Onboarding", icon: "checklist" },
  { href: "/follow-ups", label: "Email & Follow-ups", icon: "mail" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-lg shadow-rose-900/20">
        <Icon name="checklist" className="h-5 w-5" />
      </span>
      <span className="text-lg font-bold tracking-tight text-indigo-700">TC Assistant</span>
    </div>
  );
}

export default function Sidebar({
  email,
  onSignOut,
}: {
  email?: string;
  onSignOut?: () => void;
}) {
  const pathname = usePathname();

  // "/" only matches itself; other links also match their sub-pages.
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside className="border-b border-slate-100 bg-white md:sticky md:top-0 md:flex md:h-screen md:w-72 md:shrink-0 md:flex-col md:border-b-0 md:border-r">
      <div className="flex items-center justify-between px-6 py-5 md:px-8 md:py-8">
        <Brand />
        {onSignOut && (
          <button onClick={onSignOut} className="text-sm font-medium text-slate-500 hover:text-slate-900 md:hidden">
            Sign out
          </button>
        )}
      </div>

      <div className="mb-6 hidden px-6 md:block">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-700 text-white shadow-lg shadow-rose-900/10">
            <Icon name="shield" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Workspace</p>
            <p className="truncate text-sm font-bold text-slate-900">{email ?? "Demo mode"}</p>
            {!email && <p className="text-[11px] text-slate-500">Saved in this browser only</p>}
          </div>
        </div>
      </div>

      <p className="mb-3 hidden px-8 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 md:block">Menu</p>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:px-6 md:pb-0">
        {links.map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-all md:py-3 ${
                active
                  ? "bg-indigo-700 text-white shadow-lg shadow-rose-900/15"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Icon name={link.icon} className="h-5 w-5 transition-transform group-hover:scale-110" />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>

      {onSignOut && (
        <div className="mt-auto hidden p-6 md:block">
          <button
            onClick={onSignOut}
            className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-50 py-3.5 text-sm font-bold text-rose-600 hover:bg-rose-100"
          >
            <Icon name="logout" className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}
