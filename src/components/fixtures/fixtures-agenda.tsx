"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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
}: {
  fixtures: FixtureListItem[];
  today: string;
  truncated: boolean;
}) {
  const [competition, setCompetition] = useState("");
  const [query, setQuery] = useState("");
  const [showPast, setShowPast] = useState(false);

  const rows = useMemo(() => fixtures.map(toAgendaRow), [fixtures]);
  const needle = normalizeQuery(query);
  const searched = needle ? rows.filter((row) => row.searchText.includes(needle)) : rows;
  const visible = competition ? searched.filter((row) => row.competitionLabel === competition) : searched;

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
  const shownDays = [...days.keys()].filter((day) => showPast || day >= today);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SegmentedControl
          size="sm"
          className="h-auto flex-wrap"
          items={[{ label: "Todas", color: null }, ...tabs].map((tab) => {
            const key = tab.label === "Todas" ? "" : tab.label;
            const count = key ? searched.filter((row) => row.competitionLabel === key).length : searched.length;
            return {
              key: key || "all",
              active: competition === key,
              onClick: () => setCompetition(key),
              label: (
                <span className="inline-flex items-center gap-2 py-1.5">
                  {tab.color ? <span className="size-2 rounded-full" style={{ background: tab.color }} /> : null}
                  {tab.label}
                  <span className="font-mono text-[11px] text-[var(--n-500)]">{count}</span>
                </span>
              ),
            };
          })}
        />
        <ToolbarSearchField
          as="div"
          className="lg:max-w-sm"
          placeholder="Equipo, club o ciudad"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {pastDays.length > 0 && !showPast ? (
        <button
          type="button"
          onClick={() => setShowPast(true)}
          className="w-full rounded-[var(--panel-radius)] border border-dashed border-[var(--n-300)] px-3 py-2 text-sm text-[var(--n-600)] transition hover:bg-[var(--surface)]"
        >
          Ver {pastDays.length} {pastDays.length === 1 ? "día anterior" : "días anteriores"}
        </button>
      ) : null}

      {shownDays.length === 0 ? (
        <EmptyState
          title="Sin partidos para este filtro."
          description="La sincronización con la CABB corre todos los días a las 06:00."
        />
      ) : (
        shownDays.map((day) => (
          <section key={day} className="space-y-2">
            <div className="sticky top-0 z-[2] flex items-baseline gap-3 bg-[var(--page-canvas)] px-0.5 pb-1 pt-2">
              <h3 className="font-[family-name:var(--font-oswald)] text-lg font-medium capitalize text-[var(--foreground)]">
                {formatDayHeading(day)}
              </h3>
              {day === today ? (
                <span className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wider text-white">
                  HOY
                </span>
              ) : null}
              <span className="text-sm text-[var(--n-500)]">{days.get(day)!.length} partidos</span>
            </div>
            <div className="overflow-hidden rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] shadow-sm">
              {days.get(day)!.map((row) => (
                <FixtureRow key={row.id} row={row} />
              ))}
            </div>
          </section>
        ))
      )}

      {truncated ? (
        <p className="text-xs text-[var(--n-500)]">
          Se muestran los primeros {fixtures.length} partidos de la ventana.
        </p>
      ) : null}
    </div>
  );
}

function FixtureRow({ row }: { row: AgendaRow }) {
  const struck = row.suspended && "text-[var(--n-500)] line-through";
  const phase = fixturePhaseLabel(row.phase, row.group);
  const place = [row.city, row.province].filter(Boolean).map(titleCaseFixtureText).join(", ");
  const competitionName = row.competitionLabel === "Formativas" ? fixtureCategoryLabel(row.category) : row.competitionLabel;

  return (
    <div className="grid grid-cols-[44px_4px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-t border-[var(--n-100)] px-4 py-3 first:border-t-0 hover:bg-[var(--n-50)] md:grid-cols-[52px_4px_minmax(0,1fr)_200px_220px] md:gap-x-4">
      <span className={cn("font-mono text-sm font-medium", struck)}>{row.matchTime ?? "—"}</span>
      <span className="h-9 w-1 rounded-sm md:row-span-1" style={{ background: row.color }} />

      <div className="grid min-w-0 grid-cols-1 gap-0.5 text-sm font-medium md:grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] md:items-center md:gap-3">
        <span className={cn("truncate md:text-right", struck)}>{fixtureTeamLabel(row.homeTeam, row.homeClub)}</span>
        <span className="text-xs text-[var(--n-400)] md:text-center md:text-sm">
          {row.suspended ? (
            <span className="rounded border border-dashed border-[var(--n-400)] bg-[var(--n-100)] px-1.5 py-px text-[10.5px] font-semibold uppercase text-[var(--n-700)]">
              Susp.
            </span>
          ) : hasFixtureScore(row) ? (
            <span className="font-mono font-medium text-[var(--foreground)]">
              {row.homePoints} – {row.awayPoints}
            </span>
          ) : (
            "vs"
          )}
        </span>
        <span className={cn("truncate", struck)}>{fixtureTeamLabel(row.awayTeam, row.awayClub)}</span>
      </div>

      <div className="col-start-3 min-w-0 text-xs leading-snug md:col-start-auto">
        <span className="font-semibold" style={{ color: row.color === NEUTRAL_COLOR ? "var(--n-700)" : row.color }}>
          {competitionName}
        </span>
        {row.partido ? (
          <Link
            href={`/match/${row.partido.id}`}
            className="ml-2 rounded-full border border-[var(--accent)] px-2 py-px text-[10.5px] font-semibold uppercase tracking-wide text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white"
          >
            BP{row.partido.productionCode ? ` · ${row.partido.productionCode}` : ""}
          </Link>
        ) : null}
        {phase ? <span className="block truncate text-[var(--n-500)]">{phase}</span> : null}
      </div>

      <div className="col-start-3 min-w-0 text-xs leading-snug md:col-start-auto">
        <span className="block truncate">{titleCaseFixtureText(row.venue) || "—"}</span>
        {place ? <span className="block truncate text-[var(--n-500)]">{place}</span> : null}
      </div>
    </div>
  );
}
