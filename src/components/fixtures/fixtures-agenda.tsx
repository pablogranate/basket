"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";

import { finishLeagueAction, reopenLeagueAction, type FinishedLeaguesResult } from "@/app/actions/fixtures";
import {
  ArchivedCompetitionsFolder,
  CompetitionChipRow,
  useCompetitionChipDrag,
} from "@/components/fixtures/fixtures-competition-filter";
import { Badge, badgeBaseClassName } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ToolbarSearchField } from "@/components/ui/toolbar-search-field";
import type { FixtureListItem, FixturePartido } from "@/lib/data/fixtures";
import {
  FIXTURE_COMPETITION_ORDER,
  findFixtureCompetitionByLabel,
  resolveFixtureCompetition,
} from "@/lib/fixtures/competitions";
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

function competitionColor(label: string) {
  const leagueName = findFixtureCompetitionByLabel(label)?.leagueName;
  return getGridLeagueColor(leagueName)?.background ?? NEUTRAL_COLOR;
}

const FILTER_PARAMS = {
  competition: "comp",
  query: "q",
  showPast: "past",
  onlyCovered: "bp",
} as const;

// The filters ride in the URL (replaceState, so Back still leaves the page) so
// that coming back from /grid lands on the same slice instead of a reset agenda.
function writeFilterParams(filters: {
  competitions: ReadonlySet<string>;
  query: string;
  showPast: boolean;
  onlyCovered: boolean;
}) {
  const params = new URLSearchParams(window.location.search);
  params.delete(FILTER_PARAMS.competition);
  for (const label of filters.competitions) {
    params.append(FILTER_PARAMS.competition, label);
  }
  params.delete(FILTER_PARAMS.query);
  if (filters.query) {
    params.set(FILTER_PARAMS.query, filters.query);
  }
  params.delete(FILTER_PARAMS.showPast);
  if (filters.showPast) {
    params.set(FILTER_PARAMS.showPast, "1");
  }
  params.delete(FILTER_PARAMS.onlyCovered);
  if (filters.onlyCovered) {
    params.set(FILTER_PARAMS.onlyCovered, "1");
  }

  const search = params.toString();
  if (search !== window.location.search.slice(1)) {
    window.history.replaceState(null, "", search ? `/fixtures?${search}` : "/fixtures");
  }
}

export function FixturesAgenda({
  fixtures,
  today,
  truncated,
  monthNav,
  initialFinishedLeagues,
}: {
  fixtures: FixtureListItem[];
  today: string;
  truncated: boolean;
  monthNav: ReactNode;
  initialFinishedLeagues: string[];
}) {
  const searchParams = useSearchParams();
  const [competitions, setCompetitions] = useState<ReadonlySet<string>>(
    () => new Set(searchParams.getAll(FILTER_PARAMS.competition)),
  );
  const [finishedLeagues, setFinishedLeagues] = useState<string[]>(initialFinishedLeagues);
  const [finishedLeaguesError, setFinishedLeaguesError] = useState<string | null>(null);
  const [, startSavingFinishedLeagues] = useTransition();
  const [query, setQuery] = useState(() => searchParams.get(FILTER_PARAMS.query) ?? "");
  const [showPast, setShowPast] = useState(() => searchParams.get(FILTER_PARAMS.showPast) === "1");
  const [onlyCovered, setOnlyCovered] = useState(() => searchParams.get(FILTER_PARAMS.onlyCovered) === "1");
  const [focusedId, setFocusedId] = useState<string | null>(null);

  useEffect(() => {
    writeFilterParams({ competitions, query, showPast, onlyCovered });
  }, [competitions, query, showPast, onlyCovered]);

  const rows = useMemo(() => fixtures.map(toAgendaRow), [fixtures]);
  const needle = normalizeQuery(query);
  const finishedSet = new Set(finishedLeagues);
  // A finished league's rows only show while its chip is picked from the folder.
  const isShown = (row: AgendaRow) => !finishedSet.has(row.competitionLabel) || competitions.has(row.competitionLabel);
  const searchedAll = needle ? rows.filter((row) => row.searchText.includes(needle)) : rows;
  const matching = searchedAll.filter(isShown);
  const coveredCount = matching.filter((row) => row.partido).length;
  const scheduleDiffs = matching.filter((row) => row.partido?.scheduleDiffers);
  const countedRows = onlyCovered ? searchedAll.filter((row) => row.partido) : searchedAll;
  const searched = countedRows.filter(isShown);
  const visible = competitions.size ? searched.filter((row) => competitions.has(row.competitionLabel)) : searched;

  // Clears whatever filter would hide the row, then the effect scrolls to it.
  function revealRow(row: AgendaRow) {
    setOnlyCovered(false);
    if (competitions.size && !competitions.has(row.competitionLabel)) {
      setCompetitions(new Set());
    }
    if (row.matchDate < today) {
      setShowPast(true);
    }
    setFocusedId(row.id);
  }

  useEffect(() => {
    if (!focusedId) {
      return;
    }
    document.getElementById(fixtureRowId(focusedId))?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timeout = window.setTimeout(() => setFocusedId(null), 1600);
    return () => window.clearTimeout(timeout);
  }, [focusedId]);

  function toggleCompetition(label: string) {
    setCompetitions((current) => {
      const next = new Set(current);
      if (!next.delete(label)) {
        next.add(label);
      }
      return next;
    });
  }

  // Optimistic: the folder moves at once, then takes the shared list the server
  // answers with (other viewers may have changed it) or rolls back on failure.
  function saveFinishedLeagues(next: string[], save: () => Promise<FinishedLeaguesResult>) {
    const previous = finishedLeagues;
    setFinishedLeagues(next);
    setFinishedLeaguesError(null);
    startSavingFinishedLeagues(async () => {
      const result = await save();
      if (result.ok) {
        setFinishedLeagues(result.finished);
      } else {
        setFinishedLeagues(previous);
        setFinishedLeaguesError(result.error);
      }
    });
  }

  function finishLeague(label: string) {
    saveFinishedLeagues([...finishedLeagues.filter((item) => item !== label), label], () =>
      finishLeagueAction(label),
    );
    setCompetitions((current) => {
      const nextSelected = new Set(current);
      nextSelected.delete(label);
      return nextSelected;
    });
  }

  function reopenLeague(label: string) {
    saveFinishedLeagues(
      finishedLeagues.filter((item) => item !== label),
      () => reopenLeagueAction(label),
    );
  }

  const { rowHandlers, folderHandlers } = useCompetitionChipDrag({
    onArchive: finishLeague,
    onUnarchive: reopenLeague,
  });

  const countFor = (label: string) => countedRows.filter((row) => row.competitionLabel === label).length;

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
          {scheduleDiffs.length > 0 ? <ScheduleDiffMenu rows={scheduleDiffs} onSelect={revealRow} /> : null}
        </div>
        <div className="flex items-center gap-2 md:min-w-64 md:flex-1 lg:ml-auto lg:flex-none">
          <ArchivedCompetitionsFolder
            tabs={finishedLeagues.map((label) => ({
              label,
              color: tabs.find((tab) => tab.label === label)?.color ?? competitionColor(label),
              count: countFor(label),
            }))}
            selected={competitions}
            onToggle={toggleCompetition}
            onUnarchive={reopenLeague}
            dragHandlers={folderHandlers}
          />
          <ToolbarSearchField
            as="div"
            className="min-w-0 flex-1 lg:w-80 lg:flex-none"
            placeholder="Equipo, club o ciudad"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      {finishedLeaguesError ? (
        <p role="alert" className="text-xs font-semibold text-[var(--accent)]">
          {finishedLeaguesError}
        </p>
      ) : null}

      <CompetitionChipRow
        tabs={tabs
          .filter((tab) => !finishedSet.has(tab.label))
          .map((tab) => ({ ...tab, count: countFor(tab.label) }))}
        selected={competitions}
        allCount={countedRows.filter((row) => !finishedSet.has(row.competitionLabel)).length}
        onToggle={toggleCompetition}
        onClear={() => setCompetitions(new Set())}
        dragHandlers={rowHandlers}
      />

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
                <FixtureRow key={row.id} row={row} focused={row.id === focusedId} />
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

function formatShortDate(isoDate: string) {
  return `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;
}

function formatShortWeekday(isoDate: string) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("es-AR", { weekday: "short", timeZone: "UTC" });
}

function fixtureRowId(id: string) {
  return `fixture-${id}`;
}

function formatGridSchedule(row: AgendaRow, partido: FixturePartido) {
  const { date, time } = partido.schedule;
  return `${row.matchDate === date ? "" : `${formatShortDate(date)} `}${time}`;
}

function ScheduleDiffMenu({ rows, onSelect }: { rows: AgendaRow[]; onSelect: (row: AgendaRow) => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          badgeBaseClassName,
          "gap-1.5 border transition",
          open
            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
            : "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)] hover:border-[var(--accent)]",
        )}
      >
        {rows.length} con horario distinto en la grilla
        <ChevronDown className={cn("size-3.5 transition", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="panel-surface absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[min(26rem,calc(100vw-2rem))] overflow-hidden border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lift)]">
          <div className="flex items-baseline justify-between gap-3 border-b border-[var(--n-100)] px-4 py-2.5 text-sm font-semibold">
            Horario distinto en la grilla
            <span className="text-xs font-normal text-[var(--n-500)]">Oficial → Grilla</span>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {rows.map((row) => {
              const partido = row.partido!;
              return (
                <li key={row.id} className="border-t border-[var(--n-100)] first:border-t-0">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onSelect(row);
                    }}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 px-4 py-2.5 text-left hover:bg-[var(--n-50)]"
                  >
                    <span className="truncate text-sm font-medium">
                      {fixtureTeamLabel(row.homeTeam, row.homeClub)} vs {fixtureTeamLabel(row.awayTeam, row.awayClub)}
                    </span>
                    <span className="font-mono text-xs">
                      <span className="text-[var(--n-400)] line-through">{row.matchTime ?? "—"}</span>
                      {" → "}
                      <span className="font-semibold text-[var(--accent)]">{formatGridSchedule(row, partido)}</span>
                    </span>
                    <span className="col-span-2 truncate text-xs text-[var(--n-500)]">
                      {formatShortWeekday(row.matchDate)} {formatShortDate(row.matchDate)} · {row.competitionLabel}
                      {partido.productionCode ? <span className="font-mono"> · {partido.productionCode}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function GridCell({ row }: { row: AgendaRow }) {
  const partido = row.partido;

  if (!partido) {
    return <span className="text-xs text-[var(--n-400)]">No cubierto</span>;
  }

  const differs = partido.scheduleDiffers;
  const gridSchedule = formatGridSchedule(row, partido);

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

function FixtureRow({ row, focused }: { row: AgendaRow; focused: boolean }) {
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
    <div
      id={fixtureRowId(row.id)}
      className={cn(
        "scroll-mt-16 border-t border-[var(--n-100)] transition-colors duration-700 first:border-t-0",
        focused ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--n-50)]",
      )}
    >
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
