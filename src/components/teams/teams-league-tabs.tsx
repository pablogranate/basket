"use client";

import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";

import {
  assignTeamToLeagueAction,
  reorderLeagueTabsAction,
} from "@/app/actions/teams";
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

const LEAGUE_DRAG_MIME = "application/x-basket-league";

type LeagueDropIndicator = {
  league: string;
  side: "before" | "after";
};

function moveLeague(
  order: string[],
  league: string,
  target: string,
  side: "before" | "after",
) {
  const without = order.filter((value) => value !== league);
  const targetIndex = without.indexOf(target);

  if (targetIndex === -1) {
    return order;
  }

  without.splice(side === "before" ? targetIndex : targetIndex + 1, 0, league);
  return without;
}

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
  // Tabs render in a local order so a reorder paints immediately. The override
  // remembers which tabs prop it was made against, so a fresh server order
  // (leagues.sort_order after revalidation) wins as soon as the prop changes.
  const [orderOverride, setOrderOverride] = useState<{
    base: TeamDirectoryTab[];
    order: string[];
  } | null>(null);
  const [draggingLeague, setDraggingLeague] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] =
    useState<LeagueDropIndicator | null>(null);
  const [reorderError, setReorderError] = useState("");
  const [, startReordering] = useTransition();
  const tabOrder =
    orderOverride?.base === tabs
      ? orderOverride.order
      : tabs.map((tab) => tab.value);

  function setTabOrder(order: string[]) {
    setOrderOverride({ base: tabs, order });
  }

  const tabsByValue = new Map(tabs.map((tab) => [tab.value, tab]));
  const orderedTabs = tabOrder
    .map((value) => tabsByValue.get(value))
    .filter((tab): tab is TeamDirectoryTab => Boolean(tab));
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

  function isLeagueDrag(event: React.DragEvent) {
    return event.dataTransfer.types.includes(LEAGUE_DRAG_MIME);
  }

  function handleLeagueDragStart(event: React.DragEvent, league: string) {
    event.dataTransfer.setData(LEAGUE_DRAG_MIME, league);
    event.dataTransfer.effectAllowed = "move";
    setDraggingLeague(league);
    setReorderError("");
  }

  function handleLeagueDragEnd() {
    setDraggingLeague(null);
    setDropIndicator(null);
  }

  function handleLeagueDragOver(event: React.DragEvent, league: string) {
    if (!isLeagueDrag(event) || !draggingLeague) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    if (league === draggingLeague) {
      setDropIndicator(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const side =
      event.clientX < rect.left + rect.width / 2 ? "before" : "after";
    setDropIndicator((current) =>
      current?.league === league && current.side === side
        ? current
        : { league, side },
    );
  }

  function handleLeagueDrop(event: React.DragEvent, league: string) {
    if (!isLeagueDrag(event)) {
      return;
    }

    event.preventDefault();
    const dragged = event.dataTransfer.getData(LEAGUE_DRAG_MIME) || draggingLeague;
    const indicator = dropIndicator;
    handleLeagueDragEnd();

    if (!dragged || !indicator || indicator.league !== league) {
      return;
    }

    const previousOrder = tabOrder;
    const nextOrder = moveLeague(tabOrder, dragged, league, indicator.side);

    if (nextOrder.every((value, index) => value === previousOrder[index])) {
      return;
    }

    setTabOrder(nextOrder);

    startReordering(async () => {
      const result = await reorderLeagueTabsAction({ leagueNames: nextOrder });

      if (!result.ok) {
        setTabOrder(previousOrder);
        setReorderError(
          result.error ?? "No se pudo guardar el orden de las ligas.",
        );
      }
    });
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

  function leagueTabClassName(league: string) {
    return cn(
      canManageTeams && "relative cursor-grab active:cursor-grabbing",
      draggingLeague === league && "opacity-40",
      dropIndicator?.league === league &&
        dropIndicator.side === "before" &&
        "shadow-[inset_2px_0_0_var(--accent)]",
      dropIndicator?.league === league &&
        dropIndicator.side === "after" &&
        "shadow-[inset_-2px_0_0_var(--accent)]",
    );
  }

  return (
    <div className="flex items-center gap-3 border-b border-[var(--accent-border)]">
      <PageCanvasTone tone={leagueCanvasTone} />
      {reorderError ? (
        <p
          role="alert"
          className="order-last shrink-0 text-xs font-semibold text-[var(--accent)]"
        >
          {reorderError}
        </p>
      ) : null}
      <div className="flex min-w-0 flex-1 overflow-x-auto">
        <a
          href={buildHref(null)}
          onClick={(event) => handleSelect(event, null)}
          aria-current={!activeLeague ? "page" : undefined}
          className={tabClassName(!activeLeague)}
        >
          Todos ({totalCount})
        </a>
        {orderedTabs.map((tab) => (
          <a
            key={tab.value}
            href={buildHref(tab.value)}
            data-team-drop-target={canManageTeams ? "" : undefined}
            draggable={canManageTeams || undefined}
            title={canManageTeams ? "Arrastrá para reordenar las ligas" : undefined}
            onClick={(event) => handleSelect(event, tab.value)}
            onDragStart={
              canManageTeams
                ? (event) => handleLeagueDragStart(event, tab.value)
                : undefined
            }
            onDragEnd={canManageTeams ? handleLeagueDragEnd : undefined}
            onDragOver={
              canManageTeams
                ? (event) => {
                    if (isLeagueDrag(event)) {
                      handleLeagueDragOver(event, tab.value);
                      return;
                    }

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
                ? (event) => {
                    if (isLeagueDrag(event)) {
                      handleLeagueDrop(event, tab.value);
                      return;
                    }

                    handleDrop(event, tab.value);
                  }
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
            className={cn(
              tabClassName(
                activeLeague === tab.value,
                dragOverLeague === tab.value,
              ),
              leagueTabClassName(tab.value),
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
