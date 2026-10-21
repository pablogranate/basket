"use client";

import { useSearchParams } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { reorderLeagueTabsAction } from "@/app/actions/teams";
import { PageCanvasTone } from "@/components/layout/page-canvas-tone";
import { LeagueNameDialog } from "@/components/teams/league-name-dialog";
import { TeamsArchiveTab } from "@/components/teams/teams-archive-tab";
import { useTeamsEdit } from "@/components/teams/teams-edit-context";
import {
  ALL_TEAM_LEAGUES,
  ARCHIVED_TEAM_LEAGUE,
  createLeagueColorResolver,
  resolveActiveTeamLeague,
  type TeamDirectoryTab,
} from "@/lib/team-directory";
import { parseTeamDragPayload, TEAM_DRAG_MIME } from "@/lib/team-drag";
import { cn } from "@/lib/utils";

const LEAGUE_DRAG_MIME = "application/x-basket-league";

type LeagueMenu = {
  league: string;
  top: number;
  left: number;
};

// No league: the dialog creates one.
type LeagueDialog = {
  league?: string;
  teamCount?: number;
};

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
  const { editing, requestMove, clearSelection } = useTeamsEdit();
  const [leagueMenu, setLeagueMenu] = useState<LeagueMenu | null>(null);
  const [leagueDialog, setLeagueDialog] = useState<LeagueDialog | null>(null);
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
  const leagueColor = useMemo(() => createLeagueColorResolver(tabs), [tabs]);
  const leagueAccent = isLeagueView ? leagueColor(activeLeague).accent : null;
  const leagueCanvasTone = isLeagueView
    ? leagueColor(activeLeague).canvas
    : null;
  const canEditLeagues = canManageTeams && editing;

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

  // In edit mode the active league's tab opens its menu instead.
  function handleLeagueClick(
    event: React.MouseEvent<HTMLAnchorElement>,
    league: string,
  ) {
    if (!canEditLeagues || league !== activeLeague) {
      handleSelect(event, league);
      return;
    }

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setLeagueMenu({ league, top: rect.bottom + 4, left: rect.left });
  }

  function handleLeagueSaved(name: string) {
    const renamed = leagueDialog?.league;
    setLeagueDialog(null);

    if (!renamed) {
      clearSelection();
      window.history.pushState(null, "", buildHref(name));
      return;
    }

    if (searchParams.get("league") === renamed) {
      window.history.replaceState(null, "", buildHref(name));
    }
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
    <div
      data-teams-tabs
      className="flex items-center gap-3 border-b border-[var(--accent-border)]"
    >
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
            onClick={(event) => handleLeagueClick(event, tab.value)}
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
            {canEditLeagues && activeLeague === tab.value ? (
              <Pencil className="ml-2 inline size-3.5" aria-hidden="true" />
            ) : null}
          </a>
        ))}
        {canEditLeagues ? (
          <button
            type="button"
            title="Nueva liga"
            aria-label="Nueva liga"
            onClick={() => setLeagueDialog({})}
            className="-mb-px border-b-2 border-transparent px-4 py-3 text-[var(--accent)] transition hover:bg-[var(--accent-soft)]"
          >
            <Plus className="size-4" />
          </button>
        ) : null}
        <TeamsArchiveTab
          href={buildHref(ARCHIVED_TEAM_LEAGUE)}
          count={archivedCount}
          active={activeLeague === ARCHIVED_TEAM_LEAGUE}
          canManageTeams={canManageTeams}
          onSelect={(event) => handleSelect(event, ARCHIVED_TEAM_LEAGUE)}
          className={tabClassName}
        />
      </div>
      {leagueMenu ? (
        <>
          <div
            className="fixed inset-0 z-[200]"
            onClick={() => setLeagueMenu(null)}
          />
          <div
            role="menu"
            style={{ top: leagueMenu.top, left: leagueMenu.left }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setLeagueMenu(null);
              }
            }}
            className="fixed z-[201] min-w-44 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[0_12px_32px_rgba(28,13,16,0.15)]"
          >
            <button
              type="button"
              role="menuitem"
              autoFocus
              onClick={() => {
                setLeagueDialog({
                  league: leagueMenu.league,
                  teamCount: tabsByValue.get(leagueMenu.league)?.count ?? 0,
                });
                setLeagueMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--n-800)] hover:bg-[var(--n-100)]"
            >
              <Pencil className="size-3.5" />
              Renombrar liga
            </button>
          </div>
        </>
      ) : null}
      {leagueDialog ? (
        <LeagueNameDialog
          league={leagueDialog.league}
          teamCount={leagueDialog.teamCount}
          onClose={() => setLeagueDialog(null)}
          onSaved={handleLeagueSaved}
        />
      ) : null}
    </div>
  );
}
