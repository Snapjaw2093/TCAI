"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The two parts of Settings: general options, and the templates editor.
const links = [
  { href: "/settings", label: "General" },
  { href: "/settings/templates", label: "Templates" },
];

export default function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-1 border-b border-slate-200">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
            pathname === link.href
              ? "border-indigo-600 text-indigo-700"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
