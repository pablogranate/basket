import Image from "next/image";

import { getTeamInitials } from "@/lib/team-initials";
import { cn } from "@/lib/utils";

// Presentational half of TeamLogoMark: takes an already-resolved crest path so it
// carries no dependency on the `server-only` logo index. Shared by the server
// wrapper (`@/components/team-logo-mark`, which resolves the path itself) and by
// client components that get the path from the TeamLogoResolutionProvider map.
// Markup must stay byte-identical between the two paths — /grid renders the same
// card tree on the server and hydrates it on the client.

export function TeamLogoMarkView({
  teamName,
  logoSrc,
  className,
  imageClassName,
  initialsClassName,
}: {
  teamName: string;
  logoSrc: string | null;
  className?: string;
  imageClassName?: string;
  initialsClassName?: string;
}) {
  return (
    <div
      className={cn("tlm", className)}
    >
      {logoSrc ? (
        <Image
          src={logoSrc}
          alt={`Escudo de ${teamName}`}
          width={64}
          height={64}
          className={cn("size-full object-contain p-1.5", imageClassName)}
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
