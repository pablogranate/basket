"use client";

import { useSearchParams } from "next/navigation";

import { PageCanvasTone } from "@/components/layout/page-canvas-tone";
import {
  getTeamDirectoryTabs,
  getTeamLeagueAccentColor,
  getTeamLeagueCanvasTone,
  TEAM_DIRECTORY,
} from "@/lib/team-directory";
import { cn } from "@/lib/utils";

// The team directory is a static in-code catalog, so switching league is pure
// client-side filtering: tabs update the URL via history.pushState (shallow —
// no server round-trip) and the workspace re-filters from useSearchParams.
export function TeamsLeagueTabs() {
  const searchParams = useSearchParams();
  const activeLeague = searchParams.get("league")?.trim() ?? "";
  const tabs = getTeamDirectoryTabs();
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

  function tabClassName(active: boolean) {
    return cn(
      "-mb-px whitespace-nowrap border-b-2 px-6 py-3 text-sm font-bold transition",
      active
        ? "border-[var(--accent)] text-[var(--accent)]"
        : "border-transparent text-[var(--n-600)] hover:text-[var(--accent)]",
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
          Todos ({TEAM_DIRECTORY.length})
        </a>
        {tabs.map((tab) => (
          <a
            key={tab.value}
            href={buildHref(tab.value)}
            onClick={(event) => handleSelect(event, tab.value)}
            aria-current={activeLeague === tab.value ? "page" : undefined}
            style={
              activeLeague === tab.value && leagueAccent
                ? {
                    borderColor: leagueAccent,
                    color: leagueAccent,
                  }
                : undefined
            }
            className={tabClassName(activeLeague === tab.value)}
          >
            {tab.label} ({tab.count})
          </a>
        ))}
      </div>
    </div>
  );
}
