import { cache } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

import { SectionAiAssistant } from "@/components/ai/section-ai-assistant";
import { CreateMatchModal } from "@/components/grid/create-match-modal";
import { GridExportButton } from "@/components/grid/grid-export-button";
import { GridSyncButton } from "@/components/grid/grid-sync-button";
import { GridTable } from "@/components/grid/grid-table";
import { MatchCard } from "@/components/grid/match-card";
import { PeopleProvider } from "@/components/grid/people-context";
import { ProductionInsightsPanel } from "@/components/grid/production-insights-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMatchDate, getDateInputValue } from "@/lib/date";
import { getGridData } from "@/lib/data/dashboard";
import type { GridFilters } from "@/lib/data/dashboard";
import { buildProductionInsightsSummary } from "@/lib/grid/insights";
import { getLastSuccessfulSync } from "@/lib/grid/sync";
import { toExportRows } from "@/lib/grid-table";
import type { UserContext } from "@/lib/auth";
import type { MatchListItem } from "@/lib/types";
import type { parseGridSearchParams } from "@/lib/search-params";
import { getSettingsSnapshot } from "@/lib/settings";

// The grid page parses a richer filter set (adds `dateOrder`/`display`) than the
// data-layer `GridFilters`; the regions need those view-only fields too.
type GridPageFilters = ReturnType<typeof parseGridSearchParams>;

// Request-scoped memo: the page renders four streamed regions (aside, header
// actions, count, content) that each need the grid data. `cache` collapses them
// into a single Supabase round-trip per request while letting each region
// suspend independently, so the static page chrome paints before any of them.
const loadGrid = cache((user: UserContext, filters: GridFilters) =>
  getGridData(user, filters),
);

function formatDayHeading(kickoffAt: string, timezone: string) {
  const label = formatMatchDate(kickoffAt, timezone, "EEEE d 'de' MMMM");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function sortGridDayGroups(
  dayGroups: Awaited<ReturnType<typeof getGridData>>["dayGroups"],
  direction: "asc" | "desc",
) {
  const sortedGroups = [...dayGroups].sort((left, right) =>
    direction === "asc"
      ? left.key.localeCompare(right.key)
      : right.key.localeCompare(left.key),
  );

  return sortedGroups.map((group) => ({
    ...group,
    items: [...group.items].sort((left, right) =>
      direction === "asc"
        ? left.kickoff_at.localeCompare(right.kickoff_at)
        : right.kickoff_at.localeCompare(left.kickoff_at),
    ),
  }));
}

export async function GridInsightsAside({
  user,
  filters,
  currentDateLabel,
  previousDateHref,
  nextDateHref,
}: {
  user: UserContext;
  filters: GridPageFilters;
  currentDateLabel: string;
  previousDateHref: string;
  nextDateHref: string;
}) {
  const { dayGroups } = await loadGrid(user, filters);
  const insightsSummary = buildProductionInsightsSummary(
    dayGroups.flatMap((group) => group.items),
    filters.timezone,
  );

  return (
    <ProductionInsightsPanel
      summary={insightsSummary}
      currentDateLabel={currentDateLabel}
      previousDateHref={previousDateHref}
      nextDateHref={nextDateHref}
    />
  );
}

export async function GridHeaderDataActions({
  user,
  filters,
  redirectTo,
  summaryDateLabel,
}: {
  user: UserContext;
  filters: GridPageFilters;
  redirectTo: string;
  summaryDateLabel: string;
}) {
  const [{ dayGroups, owners }, settings, lastSync] = await Promise.all([
    loadGrid(user, filters),
    getSettingsSnapshot(),
    user.canEdit ? getLastSuccessfulSync() : Promise.resolve(null),
  ]);

  const visibleMatches = dayGroups.flatMap((group) => group.items);
  const exportRows = toExportRows(visibleMatches);
  const aiContext = visibleMatches.map((match) => ({
    partido: `${match.home_team} vs ${match.away_team}`,
    liga: match.competition,
    modo: match.production_mode,
    estado: match.status,
    responsable: match.owner?.full_name ?? "Sin responsable",
    fecha: formatMatchDate(match.kickoff_at, match.timezone, "dd/MM/yyyy"),
    hora: formatMatchDate(match.kickoff_at, match.timezone, "HH:mm"),
    sede: match.venue ?? "",
    asignaciones_confirmadas: match.assignments.filter(
      (assignment) => assignment.person && assignment.confirmed,
    ).length,
  }));
  const lastSyncedLabel = lastSync?.finished_at
    ? formatDistanceToNow(new Date(lastSync.finished_at), {
        addSuffix: true,
        locale: es,
      })
    : undefined;

  return (
    <>
      {user.canEdit ? (
        <GridSyncButton
          redirectTo={redirectTo}
          lastSyncedLabel={lastSyncedLabel}
        />
      ) : null}
      {visibleMatches.length ? (
        <GridExportButton rows={exportRows} periodLabel={summaryDateLabel} />
      ) : null}
      <SectionAiAssistant
        section="Producción"
        title="Consulta la producción visible"
        description="Pregunta por partidos, responsables, modos de producción o cargas visibles en esta jornada."
        placeholder="Ej. ¿Qué partidos de Liga Nacional están hoy y quién es el responsable?"
        contextLabel="Partidos visibles en Producción"
        context={aiContext}
        guidance="Prioriza partido, liga, modo, estado, responsable, fecha, hora, sede y cantidad de asignaciones confirmadas."
        examples={[
          "¿Qué partidos hay hoy?",
          "¿Quién lleva Bochas Sport Club vs River Plate?",
          "¿Qué producciones están en modo Encoder?",
        ]}
        hasGeminiKey={settings.hasGeminiKey}
        buttonVariant="icon"
      />
      <CreateMatchModal
        people={owners}
        redirectTo={redirectTo}
        canEdit={user.canEdit}
        initialDate={
          filters.view === "day" ? filters.date : getDateInputValue()
        }
      />
    </>
  );
}

export async function GridMatchCount({
  user,
  filters,
}: {
  user: UserContext;
  filters: GridPageFilters;
}) {
  const { dayGroups } = await loadGrid(user, filters);
  const count = dayGroups.reduce((total, group) => total + group.items.length, 0);

  return (
    <span className="text-sm font-medium text-[var(--muted)]">
      {count} partidos
    </span>
  );
}

export async function GridContent({
  user,
  filters,
  redirectTo,
}: {
  user: UserContext;
  filters: GridPageFilters;
  redirectTo: string;
}) {
  const { dayGroups, owners } = await loadGrid(user, filters);
  const sortedDayGroups = sortGridDayGroups(dayGroups, filters.dateOrder);

  if (!sortedDayGroups.length) {
    return (
      <EmptyState
        title="No hay partidos cargados para esta vista"
        description="Crea un partido desde Nuevo partido o cambia entre Hoy y Mes para revisar otra jornada."
      />
    );
  }

  if (filters.display === "table") {
    const tableRows = sortedDayGroups.flatMap((group) =>
      group.items.map((match: MatchListItem) => ({
        dayLabel: formatDayHeading(match.kickoff_at, match.timezone),
        match,
      })),
    );

    return (
      <GridTable
        rows={tableRows}
        canEdit={user.canEdit}
        redirectTo={redirectTo}
        people={owners}
      />
    );
  }

  return (
    <PeopleProvider people={owners}>
      {sortedDayGroups.map((group) => (
        <div key={group.key} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-2xl font-extrabold text-[var(--accent)]">
              {formatDayHeading(
                group.items[0].kickoff_at,
                group.items[0].timezone,
              )}
            </h3>
            <span className="text-sm font-medium text-[var(--muted)]">
              {group.items.length} partidos
            </span>
          </div>
          <div className="grid gap-4">
            {group.items.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                redirectTo={redirectTo}
                canEdit={user.canEdit}
              />
            ))}
          </div>
        </div>
      ))}
    </PeopleProvider>
  );
}

export function GridContentSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-live="polite">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-24 animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]"
        />
      ))}
    </div>
  );
}

export function GridInsightsSkeleton() {
  return (
    <div
      className="h-[28rem] animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]"
      aria-busy="true"
    />
  );
}

export function GridHeaderActionsSkeleton() {
  return (
    <div className="flex items-center gap-3" aria-busy="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="size-[52px] animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]"
        />
      ))}
    </div>
  );
}

export function GridCountSkeleton() {
  return (
    <span
      className="inline-block h-4 w-20 animate-pulse rounded-full bg-[var(--background-soft)]"
      aria-busy="true"
    />
  );
}
