"use client";

import type { CSSProperties } from "react";
import { CalendarDays, Clock3 } from "lucide-react";

import { badgeBaseClassName } from "@/components/ui/badge";
import { ClientTeamLogoMark } from "@/components/team-logo-mark-client";
import { getTeamLeagueColorSet } from "@/lib/team-directory";
import { cn } from "@/lib/utils";

function splitMatchLabel(matchLabel: string) {
  const [homeTeam, awayTeam] = matchLabel.split(/\s+vs\s+/i);

  return {
    homeTeam: homeTeam?.trim() || matchLabel,
    awayTeam: awayTeam?.trim() || matchLabel,
  };
}

function getLeagueBadgeStyle(league: string): CSSProperties {
  const colors = getTeamLeagueColorSet(league);

  return {
    backgroundColor: colors.soft,
    color: colors.accent,
  };
}

export function MatchSummaryCell({
  idLabel,
  matchLabel,
  competition,
  secondaryBadgeLabel,
  metaDate,
  metaTime,
  compact = false,
}: {
  idLabel?: string;
  matchLabel: string;
  competition: string;
  secondaryBadgeLabel?: string;
  metaDate?: string;
  metaTime?: string;
  compact?: boolean;
}) {
  const teams = splitMatchLabel(matchLabel);
  const hasMetaRow = Boolean(metaDate || metaTime);

  return (
    <div
      className={cn(
        "flex min-w-0 items-center",
        compact ? "gap-2.5" : "gap-4",
      )}
    >
      <div className={cn("flex shrink-0", compact ? "-space-x-1.5" : "-space-x-2")}>
        <ClientTeamLogoMark
          teamName={teams.homeTeam}
          competition={competition}
          className={cn(
            "rounded-full border-2 border-[var(--surface)] bg-[var(--n-50)]",
            compact ? "size-9" : "size-12",
          )}
          initialsClassName="text-[11px] tracking-[0.12em] text-[var(--n-500)]"
        />
        <ClientTeamLogoMark
          teamName={teams.awayTeam}
          competition={competition}
          className={cn(
            "rounded-full border-2 border-[var(--surface)] bg-[var(--n-50)]",
            compact ? "size-9" : "size-12",
          )}
          initialsClassName="text-[11px] tracking-[0.12em] text-[var(--n-500)]"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn("flex flex-wrap items-center", compact ? "mb-1.5 gap-1.5" : "mb-2 gap-2")}>
          {idLabel ? (
            <span
              className={`${badgeBaseClassName} border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]`}
            >
              {idLabel}
            </span>
          ) : null}
          {secondaryBadgeLabel ? (
            <span
              style={getLeagueBadgeStyle(secondaryBadgeLabel)}
              className={badgeBaseClassName}
            >
              {secondaryBadgeLabel}
            </span>
          ) : null}
        </div>
        <div className={cn(compact ? "space-y-0.5" : "space-y-1")}>
          <p
            className={cn(
              "block min-w-0 truncate font-bold leading-tight text-[var(--foreground)]",
              compact && "text-[12px]",
            )}
          >
            {teams.homeTeam}
          </p>
          <div className={cn("flex min-w-0 items-start", compact ? "gap-1.5" : "gap-2")}>
            <p className="shrink-0 pt-0.5 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
              vs
            </p>
            <p
              className={cn(
                "block min-w-0 truncate font-bold leading-tight text-[var(--foreground)]",
                compact && "text-[12px]",
              )}
            >
              {teams.awayTeam}
            </p>
          </div>
        </div>
        {hasMetaRow ? (
          <div
            className={cn(
              "mt-1 flex flex-wrap items-center text-xs font-medium text-[var(--n-500)]",
              compact ? "gap-2.5" : "gap-4",
            )}
          >
            {metaDate ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5 text-[var(--n-300)]" />
                {metaDate}
              </span>
            ) : null}
            {metaTime ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="size-3.5 text-[var(--n-300)]" />
                {metaTime}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="mt-1 block text-xs font-medium text-[var(--n-500)]">
            {competition}
          </span>
        )}
      </div>
    </div>
  );
}
