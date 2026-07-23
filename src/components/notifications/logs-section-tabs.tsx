import Link from "next/link";
import { BellRing, RefreshCw, Users } from "lucide-react";

import { cn } from "@/lib/utils";

const TABS = [
  { key: "notifications", href: "/notifications/logs", label: "Notificaciones", icon: BellRing },
  { key: "syncs", href: "/notifications/syncs", label: "Grilla", icon: RefreshCw },
  { key: "people-syncs", href: "/notifications/sync-people", label: "Contactos", icon: Users },
] as const;

export type LogsSection = (typeof TABS)[number]["key"];

export function LogsSectionTabs({ active }: { active: LogsSection }) {
  return (
    <div className="border-b border-[var(--border)]">
      <div className="flex items-center gap-8">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.key === active;

          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 border-b-2 pb-3 text-sm font-bold transition",
                isActive
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[var(--n-400)] hover:text-[var(--n-600)]",
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
