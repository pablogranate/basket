"use client";

import { Folder } from "lucide-react";
import { useState } from "react";

import { useTeamsEdit } from "@/components/teams/teams-edit-context";
import { ARCHIVED_TEAM_LEAGUE } from "@/lib/team-directory";
import { parseTeamDragPayload, TEAM_DRAG_MIME } from "@/lib/team-drag";
import { cn } from "@/lib/utils";

// The "Archivados" tab: teams without a league this season. Cards dropped on
// it leave all their leagues (the teams themselves stay); dragging archived
// cards onto a league tab brings them back.
export function TeamsArchiveTab({
  href,
  count,
  active,
  canManageTeams,
  onSelect,
  className,
}: {
  href: string;
  count: number;
  active: boolean;
  canManageTeams: boolean;
  onSelect: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  className: (active: boolean, isDropTarget: boolean) => string;
}) {
  const { requestMove } = useTeamsEdit();
  const [dragOver, setDragOver] = useState(false);

  function isTeamDrag(event: React.DragEvent) {
    return event.dataTransfer.types.includes(TEAM_DRAG_MIME);
  }

  return (
    <a
      href={href}
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      data-team-drop-target={canManageTeams && !active ? "" : undefined}
      onDragOver={
        canManageTeams && !active
          ? (event) => {
              if (isTeamDrag(event)) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOver(true);
              }
            }
          : undefined
      }
      onDragLeave={canManageTeams ? () => setDragOver(false) : undefined}
      onDrop={
        canManageTeams && !active
          ? (event) => {
              if (!isTeamDrag(event)) {
                return;
              }

              event.preventDefault();
              setDragOver(false);
              requestMove({
                teams: parseTeamDragPayload(event.dataTransfer.getData(TEAM_DRAG_MIME)),
                target: ARCHIVED_TEAM_LEAGUE,
                fromLeague: null,
              });
            }
          : undefined
      }
      className={cn(className(active, dragOver), "inline-flex items-center gap-2")}
    >
      <Folder className="size-4" />
      Archivados ({count})
    </a>
  );
}
