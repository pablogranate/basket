"use client";

import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { reorderLeagueTabsAction } from "@/app/actions/teams";
import { PageCanvasTone } from "@/components/layout/page-canvas-tone";
import { TeamsArchiveTab } from "@/components/teams/teams-archive-tab";
import { useTeamsEdit } from "@/components/teams/teams-edit-context";
import {
  ALL_TEAM_LEAGUES,
  ARCHIVED_TEAM_LEAGUE,
  getTeamLeagueAccentColor,
  getTeamLeagueCanvasTone,
  resolveActiveTeamLeague,
  type TeamDirectoryTab,
} from "@/lib/team-directory";
import { parseTeamDragPayload, TEAM_DRAG_MIME } from "@/lib/team-drag";
import { cn } from "@/lib/utils";

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
  archivedCount,
  defaultLeague,
  canManageTeams = false,
}: {
  tabs: TeamDirectoryTab[];
  totalCount: number;
  archivedCount: number;
  defaultLeague: string;
  canManageTeams?: boolean;
}) {
  const searchParams = useSearchParams();
  const { requestMove, clearSelection } = useTeamsEdit();
  const [dragOverLeague, setDragOverLeague] = useState<string | null>(null);
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
  const activeLeague = resolveActiveTeamLeague(
    searchParams.get("league"),
    defaultLeague,
  );
  const isLeagueView =
    Boolean(activeLeague) && activeLeague !== ARCHIVED_TEAM_LEAGUE;
  const leagueAccent = isLeagueView
    ? getTeamLeagueAccentColor(activeLeague)
    : null;
  const leagueCanvasTone = isLeagueView
    ? getTeamLeagueCanvasTone(activeLeague)
    : null;

  function buildHref(league: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (league === defaultLeague) {
      params.delete("league");
    } else {
      params.set("league", league);
    }

    const query = params.toString();
    return query ? `/teams?${query}` : "/teams";
  }

  function handleSelect(
    event: React.MouseEvent<HTMLAnchorElement>,
    league: string,
  ) {
    event.preventDefault();
    clearSelection();
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

    if (league === activeLeague) {
      return;
    }

    requestMove({
      teams: parseTeamDragPayload(event.dataTransfer.getData(TEAM_DRAG_MIME)),
      target: league,
      fromLeague: isLeagueView ? activeLeague : null,
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
          href={buildHref(ALL_TEAM_LEAGUES)}
          onClick={(event) => handleSelect(event, ALL_TEAM_LEAGUES)}
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
        <TeamsArchiveTab
          href={buildHref(ARCHIVED_TEAM_LEAGUE)}
          count={archivedCount}
          active={activeLeague === ARCHIVED_TEAM_LEAGUE}
          canManageTeams={canManageTeams}
          onSelect={(event) => handleSelect(event, ARCHIVED_TEAM_LEAGUE)}
          className={tabClassName}
        />
      </div>
    </div>
  );
}
