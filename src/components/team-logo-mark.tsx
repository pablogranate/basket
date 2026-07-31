import { TeamLogoMarkView } from "@/components/team-logo-mark-view";
import { getTeamLogoPath } from "@/lib/team-logos";

// Server-only wrapper: resolves the crest against the on-disk logo index and
// delegates the markup to TeamLogoMarkView. Client components must use the view
// directly with a pre-resolved `logoSrc` (see match-card.tsx).

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
  return (
    <TeamLogoMarkView
      teamName={teamName}
      logoSrc={getTeamLogoPath({ teamName, competition })}
      className={className}
      imageClassName={imageClassName}
      initialsClassName={initialsClassName}
    />
  );
}
