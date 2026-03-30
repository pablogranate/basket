"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Shield } from "lucide-react";

import { cn } from "@/lib/utils";

const collaboratorItems = [
  { href: "/mi-jornada", label: "Mi jornada", icon: ClipboardList },
  { href: "/teams", label: "Equipos", icon: Shield },
] as const;

export function CollaboratorNav({
  mobile = false,
  allowTeams = true,
}: {
  mobile?: boolean;
  allowTeams?: boolean;
}) {
  const pathname = usePathname();
  const items = allowTeams
    ? collaboratorItems
    : collaboratorItems.filter((item) => item.href === "/mi-jornada");

  if (mobile) {
    return (
      <nav className="flex items-center gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center gap-2 rounded-[var(--panel-radius)] px-4 py-3 text-sm font-bold transition",
                active
                  ? "bg-[var(--accent)] text-white shadow-[0_14px_28px_rgba(230,18,56,0.18)]"
                  : "bg-[var(--surface)] text-[#617187] hover:bg-[var(--background-soft)] hover:text-[var(--foreground)]",
              )}
            >
              <Icon className="size-4" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1">
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-bold transition",
              active
                ? "bg-[var(--accent)] text-white shadow-[0_14px_28px_rgba(230,18,56,0.18)]"
                : "text-[#617187] hover:bg-[var(--background-soft)] hover:text-[var(--foreground)]",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
