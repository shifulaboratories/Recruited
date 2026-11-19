"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui";

const ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: "/jobs", label: "Jobs", icon: "jobs" },
  { href: "/applications", label: "Applicants", icon: "people" },
  { href: "/interviews", label: "Your interviews", icon: "calendar" },
  { href: "/settings", label: "Connect Claude", icon: "plug" },
];

/** The app's places, the ones this role gets. The current one is lit; that's the only state here. */
export function Nav({ counts, only }: { counts: Partial<Record<string, number>>; only: string[] }) {
  const path = usePathname();
  return (
    <nav className="flex md:flex-col gap-0.5" aria-label="Main">
      {ITEMS.filter((it) => only.includes(it.href)).map((it) => {
        const on = path === it.href || path.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={on ? "page" : undefined}
            className={`group flex items-center gap-2.5 h-8 px-2.5 rounded-lg text-[13px] font-medium transition-colors ${
              on ? "bg-rt-surface text-rt-foreground shadow-[var(--rt-shadow-card)]" : "text-rt-muted hover:text-rt-foreground hover:bg-rt-subtle"
            }`}
          >
            <Icon name={it.icon} size={15} className={on ? "text-rt-primary" : ""} />
            <span className="hidden sm:inline">{it.label}</span>
            {counts[it.href] != null && (
              <span className="hidden md:inline ml-auto font-mono text-[10.5px] text-rt-faint tabular">{counts[it.href]}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
