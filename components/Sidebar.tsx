"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/follow-ups", label: "Follow-ups" },
  { href: "/settings/templates", label: "Templates" },
  { href: "/settings", label: "Settings" },
];

export default function Sidebar({
  email,
  onSignOut,
}: {
  email?: string;
  onSignOut?: () => void;
}) {
  const pathname = usePathname();

  // "/" only matches itself; other links also match their sub-pages.
  const isActive = (href: string) =>
    href === "/" || href === "/settings"
      ? pathname === href
      : pathname.startsWith(href);

  return (
    <aside className="border-b border-slate-200 bg-white md:flex md:min-h-screen md:w-60 md:flex-col md:border-b-0 md:border-r">
      <div className="flex items-center justify-between px-6 py-5">
        <span className="text-lg font-semibold text-slate-900">TC Assistant</span>
        {onSignOut && (
          <button
            onClick={onSignOut}
            className="text-sm text-slate-500 hover:text-slate-900 md:hidden"
          >
            Sign out
          </button>
        )}
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive(link.href)
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      {onSignOut && (
        <div className="mt-auto hidden border-t border-slate-200 px-6 py-4 md:block">
          <p className="truncate text-xs text-slate-500">{email}</p>
          <button
            onClick={onSignOut}
            className="mt-1 text-sm font-medium text-slate-700 hover:text-slate-900"
          >
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}
