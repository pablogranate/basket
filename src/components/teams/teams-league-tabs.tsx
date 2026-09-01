"use client";

import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { assignTeamToLeagueAction } from "@/app/actions/teams";
import { PageCanvasTone } from "@/components/layout/page-canvas-tone";
import { Button } from "@/components/ui/button";
import {
  getTeamLeagueAccentColor,
  getTeamLeagueCanvasTone,
  type TeamDirectoryTab,
} from "@/lib/team-directory";
import {
  parseTeamDragPayload,
  TEAM_DRAG_MIME,
  type TeamDragPayload,
} from "@/lib/team-drag";
import { cn } from "@/lib/utils";

type PendingDrop = {
  team: TeamDragPayload;
  league: string;
};

// Tabs and counts come from the server (leagues/memberships tables); switching
// league stays pure client-side filtering: tabs update the URL via
// history.pushState (shallow — no server round-trip) and the workspace
// re-filters from useSearchParams.
export function TeamsLeagueTabs({
  tabs,
  totalCount,
  canManageTeams = false,
}: {
  tabs: TeamDirectoryTab[];
  totalCount: number;
  canManageTeams?: boolean;
}) {
  const searchParams = useSearchParams();
  const [dragOverLeague, setDragOverLeague] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isAssigning, startAssigning] = useTransition();
  const activeLeague = searchParams.get("league")?.trim() ?? "";
  const leagueAccent = activeLeague
    ? getTeamLeagueAccentColor(activeLeague)
    : null;
  const leagueCanvasTone = activeLeague
    ? getTeamLeagueCanvasTone(activeLeague)
    : null;

  function buildHref(league: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (league) {
      params.set("league", league);
    } else {
      params.delete("league");
    }

    const query = params.toString();
    return query ? `/teams?${query}` : "/teams";
  }

  function handleSelect(
    event: React.MouseEvent<HTMLAnchorElement>,
    league: string | null,
  ) {
    event.preventDefault();
    window.history.pushState(null, "", buildHref(league));
  }

  function isTeamDrag(event: React.DragEvent) {
    return event.dataTransfer.types.includes(TEAM_DRAG_MIME);
  }

  function handleDrop(event: React.DragEvent, league: string) {
    if (!isTeamDrag(event)) {
      return;
    }

    event.preventDefault();
    setDragOverLeague(null);

    const team = parseTeamDragPayload(
      event.dataTransfer.getData(TEAM_DRAG_MIME),
    );

    if (team) {
      setErrorMessage("");
      setPendingDrop({ team, league });
    }
  }

  function closeDialog() {
    setPendingDrop(null);
    setErrorMessage("");
  }

  function confirmAssign(mode: "move" | "add") {
    if (!pendingDrop || isAssigning) {
      return;
    }

    startAssigning(async () => {
      const result = await assignTeamToLeagueAction({
        teamId: pendingDrop.team.id,
        leagueName: pendingDrop.league,
        mode,
        fromLeague: activeLeague || null,
      });

      if (result.ok) {
        closeDialog();
      } else {
        setErrorMessage(result.error ?? "No se pudo actualizar el equipo.");
      }
    });
  }

  function tabClassName(active: boolean, isDropTarget = false) {
    return cn(
      "-mb-px whitespace-nowrap border-b-2 px-6 py-3 text-sm font-bold transition",
      active
        ? "border-[var(--accent)] text-[var(--accent)]"
        : "border-transparent text-[var(--n-600)] hover:text-[var(--accent)]",
      isDropTarget &&
        "rounded-t-md bg-[var(--accent-soft)] text-[var(--accent)]",
    );
  }

  return (
    <div className="flex items-center gap-3 border-b border-[var(--accent-border)]">
      <PageCanvasTone tone={leagueCanvasTone} />
      <div className="flex min-w-0 flex-1 overflow-x-auto">
        <a
          href={buildHref(null)}
          onClick={(event) => handleSelect(event, null)}
          aria-current={!activeLeague ? "page" : undefined}
          className={tabClassName(!activeLeague)}
        >
          Todos ({totalCount})
        </a>
        {tabs.map((tab) => (
          <a
            key={tab.value}
            href={buildHref(tab.value)}
            data-team-drop-target={canManageTeams ? "" : undefined}
            onClick={(event) => handleSelect(event, tab.value)}
            onDragOver={
              canManageTeams
                ? (event) => {
                    if (isTeamDrag(event)) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDragOverLeague(tab.value);
                    }
                  }
                : undefined
            }
            onDragLeave={
              canManageTeams
                ? () =>
                    setDragOverLeague((current) =>
                      current === tab.value ? null : current,
                    )
                : undefined
            }
            onDrop={
              canManageTeams
                ? (event) => handleDrop(event, tab.value)
                : undefined
            }
            aria-current={activeLeague === tab.value ? "page" : undefined}
            style={
              activeLeague === tab.value && leagueAccent
                ? {
                    borderColor: leagueAccent,
                    color: leagueAccent,
                  }
                : undefined
            }
            className={tabClassName(
              activeLeague === tab.value,
              dragOverLeague === tab.value,
            )}
          >
            {tab.label} ({tab.count})
          </a>
        ))}
      </div>

      {pendingDrop
        ? createPortal(
            <div
              className="fixed inset-0 z-[300] flex items-center justify-center bg-[var(--n-900)]/60 p-4 backdrop-blur-sm"
              onClick={closeDialog}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Asignar equipo a liga"
                onClick={(event) => event.stopPropagation()}
                className="panel-surface relative flex w-full max-w-md flex-col gap-5 border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_24px_64px_rgba(28,13,16,0.22)]"
              >
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  ¿Se agrega el equipo {pendingDrop.team.name} a la liga{" "}
                  {pendingDrop.league}, o se mueve a esa liga?
                </p>

                {errorMessage ? (
                  <p className="text-sm font-semibold text-[var(--accent)]">
                    {errorMessage}
                  </p>
                ) : null}

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={closeDialog}
                    disabled={isAssigning}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => confirmAssign("add")}
                    disabled={isAssigning}
                  >
                    Agregar
                  </Button>
                  <Button
                    type="button"
                    onClick={() => confirmAssign("move")}
                    disabled={isAssigning}
                  >
                    Mover
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
