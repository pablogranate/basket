import Image from "next/image";

import { getTeamInitials, getTeamLogoPath } from "@/lib/team-logos";
import { cn } from "@/lib/utils";

export function TeamLogoMark({
  teamName,
  competition,
  className,
  imageClassName,
  initialsClassName,
}: {
  teamName: string;
  competition?: string | null;
  className?: string;
  imageClassName?: string;
  initialsClassName?: string;
}) {
  const logoSrc = getTeamLogoPath({ teamName, competition });

  return (
    <div
      className={cn("tlm", className)}
    >
      {logoSrc ? (
        <Image
          src={logoSrc}
          alt={`Escudo de ${teamName}`}
          fill
          sizes="64px"
          className={cn("object-contain p-1.5", imageClassName)}
        />
      ) : (
        <span
          className={cn(
            "text-xs font-black uppercase tracking-[0.24em] text-[var(--foreground)]",
            initialsClassName,
          )}
        >
          {getTeamInitials(teamName)}
        </span>
      )}
    </div>
  );
}
