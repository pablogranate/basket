import { ShieldCheck, ShieldOff } from "lucide-react";

import { badgeBaseClassName } from "@/components/ui/badge";
import { getPortalAccessDisplayName } from "@/lib/display";
import type { PersonPortalAccess } from "@/lib/types";
import { cn } from "@/lib/utils";

const ACCESS_BADGE_CLASS_NAMES: Record<PersonPortalAccess, string> = {
  admin: "border-[var(--navy)] bg-[var(--navy)] text-white",
  editor:
    "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]",
  collaborator: "border-[var(--ok-border)] bg-[var(--ok-soft)] text-[var(--ok)]",
  revocado: "border-[var(--n-200)] bg-[var(--n-100)] text-[var(--n-500)]",
  "sin-cuenta":
    "border-dashed border-[var(--n-300)] bg-transparent text-[var(--n-400)]",
  desconocido: "border-[var(--n-200)] bg-[var(--n-50)] text-[var(--n-400)]",
};

export function PersonAccessBadge({
  access,
  className,
}: {
  access: PersonPortalAccess;
  className?: string;
}) {
  const Icon =
    access === "revocado"
      ? ShieldOff
      : access === "sin-cuenta" || access === "desconocido"
        ? null
        : ShieldCheck;

  return (
    <span
      className={cn(
        badgeBaseClassName,
        "gap-1 whitespace-nowrap border",
        ACCESS_BADGE_CLASS_NAMES[access],
        className,
      )}
    >
      {Icon ? <Icon className="size-3" /> : null}
      {getPortalAccessDisplayName(access)}
    </span>
  );
}
