"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ToolbarSearchField } from "@/components/ui/toolbar-search-field";
import type { FixtureListItem } from "@/lib/data/fixtures";
import { FIXTURE_COMPETITION_ORDER, resolveFixtureCompetition } from "@/lib/fixtures/competitions";
import {
  fixtureCategoryLabel,
  fixturePhaseLabel,
  fixtureTeamLabel,
  hasFixtureScore,
  titleCaseFixtureText,
} from "@/lib/fixtures/display";
import { getGridLeagueColor } from "@/lib/league-grid-colors";
import { cn } from "@/lib/utils";

type AgendaRow = FixtureListItem & {
  competitionLabel: string;
  color: string;
  searchText: string;
};

const NEUTRAL_COLOR = "var(--n-400)";

// Pale league fills (Endesa's #c6dbe1) mark the bar and dot but are unreadable
// as text on white.
function competitionTextColor(color: string) {
  const hex = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!hex) {
    return "var(--n-700)";
  }
  const [r, g, b] = hex.slice(1).map((part) => parseInt(part, 16));
  const luminance = (0.299 * r! + 0.587 * g! + 0.114 * b!) / 255;
  return luminance > 0.7 ? "var(--n-700)" : color;
}

function toAgendaRow(fixture: FixtureListItem): AgendaRow {
  const competition = resolveFixtureCompetition(fixture.competition);
  const color = getGridLeagueColor(competition.leagueName)?.background ?? NEUTRAL_COLOR;
  const searchText = [
    fixture.homeTeam,
    fixture.awayTeam,
    fixture.homeClub,
    fixture.awayClub,
    fixture.venue,
    fixture.city,
    fixture.province,
  ]
    .join(" ")
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/g, "")
    .toLowerCase();

  return { ...fixture, competitionLabel: competition.label, color, searchText };
}

function formatDayHeading(isoDate: string) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function normalizeQuery(value: string) {
  return value.normalize("NFD").replaceAll(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function FixturesAgenda({
  fixtures,
  today,
  truncated,
  monthNav,
}: {
  fixtures: FixtureListItem[];
  today: string;
  truncated: boolean;
  monthNav: ReactNode;
}) {
  const [competitions, setCompetitions] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [onlyCovered, setOnlyCovered] = useState(false);

  const rows = useMemo(() => fixtures.map(toAgendaRow), [fixtures]);
  const needle = normalizeQuery(query);
  const matching = needle ? rows.filter((row) => row.searchText.includes(needle)) : rows;
  const coveredCount = matching.filter((row) => row.partido).length;
  const scheduleDiffCount = matching.filter((row) => row.partido?.scheduleDiffers).length;
  const searched = onlyCovered ? matching.filter((row) => row.partido) : matching;
  const visible = competitions.size ? searched.filter((row) => competitions.has(row.competitionLabel)) : searched;

  function toggleCompetition(label: string) {
    setCompetitions((current) => {
      const next = new Set(current);
      if (!next.delete(label)) {
        next.add(label);
      }
      return next;
    });
  }

  const tabs = useMemo(() => {
    const present = new Set(rows.map((row) => row.competitionLabel));
    const ordered = FIXTURE_COMPETITION_ORDER.filter((label) => present.has(label));
    const others = [...present].filter((label) => !ordered.includes(label)).sort();
    return [...ordered, ...others].map((label) => ({
      label,
      color: rows.find((row) => row.competitionLabel === label)?.color ?? NEUTRAL_COLOR,
    }));
  }, [rows]);

  const days = new Map<string, AgendaRow[]>();
  for (const row of visible) {
    const bucket = days.get(row.matchDate) ?? [];
    bucket.push(row);
    days.set(row.matchDate, bucket);
  }
  const pastDays = [...days.keys()].filter((day) => day < today);
  // Only a month with days still ahead collapses its past; a past month shows whole.
  const collapsePast = !showPast && pastDays.length < days.size;
  const shownDays = [...days.keys()].filter((day) => !collapsePast || day >= today);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        {monthNav}
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            size="sm"
            className="w-full sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none"
            items={[
              { key: "all", label: "Todos", count: matching.length, active: !onlyCovered, covered: false },
              { key: "covered", label: "Cubiertos por BP", count: coveredCount, active: onlyCovered, covered: true },
            ].map((item) => ({
              key: item.key,
              active: item.active,
              onClick: () => setOnlyCovered(item.covered),
              label: (
                <span className="inline-flex w-full items-center justify-center gap-2">
                  {item.label}
                  <span className="font-mono text-[11px] text-[var(--n-500)]">{item.count}</span>
                </span>
              ),
            }))}
          />
          {scheduleDiffCount > 0 ? (
            <Badge className="border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]">
              {scheduleDiffCount} con horario distinto en la grilla
            </Badge>
          ) : null}
        </div>
        <ToolbarSearchField
          as="div"
          className="md:min-w-64 md:flex-1 lg:ml-auto lg:max-w-xs lg:flex-none"
          placeholder="Equipo, club o ciudad"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div
        role="group"
        aria-label="Ligas"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0"
      >
        <LeagueChip
          label="Todas"
          count={searched.length}
          active={competitions.size === 0}
          onClick={() => setCompetitions(new Set())}
        />
        {tabs.map((tab) => (
          <LeagueChip
            key={tab.label}
            label={tab.label}
            color={tab.color}
            count={searched.filter((row) => row.competitionLabel === tab.label).length}
            active={competitions.has(tab.label)}
            onClick={() => toggleCompetition(tab.label)}
          />
        ))}
      </div>

      {collapsePast && pastDays.length > 0 ? (
        <Button variant="secondary" className="w-full border-dashed font-medium" onClick={() => setShowPast(true)}>
          Ver {pastDays.length} {pastDays.length === 1 ? "día anterior" : "días anteriores"}
        </Button>
      ) : null}

      {shownDays.length === 0 ? (
        <EmptyState
          title="Sin partidos para este filtro."
          description="Probá otro mes. La sincronización corre todos los días a las 06:00."
        />
      ) : (
        shownDays.map((day) => (
          <section key={day} className="space-y-2">
            <div className="sticky top-0 z-[2] flex items-baseline gap-3 bg-[var(--page-canvas)] px-0.5 pb-1 pt-2">
              <h3 className="font-[family-name:var(--font-oswald)] text-lg font-medium capitalize text-[var(--foreground)]">
                {formatDayHeading(day)}
              </h3>
              {day === today ? (
                <Badge className="border-[var(--accent)] bg-[var(--accent)] text-white">Hoy</Badge>
              ) : null}
              <span className="text-sm text-[var(--n-500)]">{days.get(day)!.length} partidos</span>
            </div>
            <Card className="overflow-hidden p-0">
              {days.get(day)!.map((row) => (
                <FixtureRow key={row.id} row={row} />
              ))}
            </Card>
          </section>
        ))
      )}

      {truncated ? (
        <p className="text-xs text-[var(--n-500)]">
          Se muestran los primeros {fixtures.length} partidos del mes.
        </p>
      ) : null}
    </div>
  );
}

function LeagueChip({
  label,
  color,
  count,
  active,
  onClick,
}: {
  label: string;
  color?: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-bold transition",
        active
          ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--foreground)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)]",
      )}
    >
      {color ? <span className="size-2 rounded-full" style={{ background: color }} /> : null}
      {label}
      <span className="font-mono text-[11px] font-medium text-[var(--n-500)]">{count}</span>
    </button>
  );
}

function formatShortDate(isoDate: string) {
  return `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;
}

function GridCell({ row }: { row: AgendaRow }) {
  const partido = row.partido;

  if (!partido) {
    return <span className="text-xs text-[var(--n-400)]">No cubierto</span>;
  }

  const differs = partido.scheduleDiffers;
  const { date, time } = partido.schedule;
  const gridSchedule = `${row.matchDate === date ? "" : `${formatShortDate(date)} `}${time}`;

  return (
    <span className="flex flex-col items-start gap-0.5 text-xs leading-snug">
      <Link
        href={`/grid?view=day&date=${partido.gridDate}`}
        title="Ver el día en la grilla"
        className="font-mono font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
      >
        {partido.productionCode ?? "Partido"} →
      </Link>
      <span className={differs ? "font-medium text-[var(--accent)]" : "text-[var(--n-500)]"}>
        {differs ? `Grilla ${gridSchedule} · distinto` : `Grilla ${gridSchedule}`}
      </span>
    </span>
  );
}

function FixtureRow({ row }: { row: AgendaRow }) {
  const struck = row.suspended && "text-[var(--n-500)] line-through";
  const phase = fixturePhaseLabel(row.phase, row.group);
  const place = [row.city, row.province].filter(Boolean).map(titleCaseFixtureText).join(", ");
  const venue = titleCaseFixtureText(row.venue);
  const competitionName = row.competitionLabel === "Formativas" ? fixtureCategoryLabel(row.category) : row.competitionLabel;
  const competitionColor = competitionTextColor(row.color);
  const home = fixtureTeamLabel(row.homeTeam, row.homeClub);
  const away = fixtureTeamLabel(row.awayTeam, row.awayClub);
  const scored = hasFixtureScore(row);

  return (
    <div className="border-t border-[var(--n-100)] first:border-t-0 hover:bg-[var(--n-50)]">
      <div className="flex gap-3 px-4 py-3 lg:hidden">
        <span className="w-1 shrink-0 self-stretch rounded-sm" style={{ background: row.color }} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate">
              <span className="font-semibold" style={{ color: competitionColor }}>
                {competitionName}
              </span>
              {phase ? <span className="text-[var(--n-500)]"> · {phase}</span> : null}
            </span>
            <span className={cn("shrink-0 font-mono text-sm font-medium", struck)}>{row.matchTime ?? "—"}</span>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 text-sm font-medium">
            <span className={cn("truncate", struck)}>{home}</span>
            <span className="font-mono">{scored ? row.homePoints : null}</span>
            <span className={cn("truncate", struck)}>{away}</span>
            <span className="font-mono">{scored ? row.awayPoints : null}</span>
          </div>

          {row.suspended || venue || place || row.partido ? (
            <div className="flex items-end justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-[var(--n-500)]">
                {row.suspended ? <Badge className="mr-2 px-1.5 py-0.5">Susp.</Badge> : null}
                {[venue, place].filter(Boolean).join(" · ")}
              </span>
              {row.partido ? (
                <span className="shrink-0">
                  <GridCell row={row} />
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="hidden grid-cols-[52px_4px_minmax(0,1fr)_180px_200px_150px] items-center gap-x-4 px-4 py-3 lg:grid">
        <span className={cn("font-mono text-sm font-medium", struck)}>{row.matchTime ?? "—"}</span>
        <span className="h-9 w-1 rounded-sm" style={{ background: row.color }} />

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] items-center gap-3 text-sm font-medium">
          <span className={cn("truncate text-right", struck)}>{home}</span>
          <span className="text-center text-sm text-[var(--n-400)]">
            {row.suspended ? (
              <Badge className="px-1.5 py-0.5">Susp.</Badge>
            ) : scored ? (
              <span className="font-mono font-medium text-[var(--foreground)]">
                {row.homePoints} – {row.awayPoints}
              </span>
            ) : (
              "vs"
            )}
          </span>
          <span className={cn("truncate", struck)}>{away}</span>
        </div>

        <div className="min-w-0 text-xs leading-snug">
          <span className="font-semibold" style={{ color: competitionColor }}>
            {competitionName}
          </span>
          {phase ? <span className="block truncate text-[var(--n-500)]">{phase}</span> : null}
        </div>

        <div className="min-w-0 text-xs leading-snug">
          <span className="block truncate">{venue || "—"}</span>
          {place ? <span className="block truncate text-[var(--n-500)]">{place}</span> : null}
        </div>

        <div className="min-w-0 border-l border-dashed border-[var(--n-200)] pl-3">
          <GridCell row={row} />
        </div>
      </div>
    </div>
  );
}
