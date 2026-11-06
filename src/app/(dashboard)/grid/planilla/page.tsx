import { Suspense } from "react";

import { GridDateStepper } from "@/components/grid/grid-date-stepper";
import { GridDisplayToggle } from "@/components/grid/grid-display-toggle";
import { GridReturnRecorder } from "@/components/grid/grid-return-link";
import { GridSearchField } from "@/components/grid/grid-search-field";
import { GridStatsButton } from "@/components/grid/grid-stats-button";
import { GridPlanilla } from "@/components/grid/planilla/grid-planilla";
import { SectionPageHeader } from "@/components/layout/section-page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { requireUserContext } from "@/lib/auth";
import { getGridData } from "@/lib/data/dashboard";
import { getTeamPickerCatalog } from "@/lib/data/teams";
import { toDateKey } from "@/lib/date";
import {
  buildGridDateStepHrefs,
  buildGridViewHrefs,
  formatGridDateLabel,
  toPlanillaHref,
  toStringGridSearchParams,
} from "@/lib/grid/nav-hrefs";
import { toPlanillaRows } from "@/lib/grid/planilla";
import { listLeagues } from "@/lib/leagues/leagues";
import { parseGridSearchParams } from "@/lib/search-params";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// The Planilla reads the same query as /grid (view, date, q), so the toolbar
// moves between the two without losing the day or the search.
export default async function GridPlanillaPage({ searchParams }: PageProps) {
  const rawParams = await searchParams;
  const user = await requireUserContext();
  const filters = parseGridSearchParams(rawParams, { displayFallback: "table" });

  const [{ dayGroups, owners }, leagues, teamCatalog] = await Promise.all([
    getGridData(user, {
      view: filters.view,
      date: filters.date,
      q: filters.q,
      league: "",
      mode: "",
      status: "",
      owner: "",
      timezone: filters.timezone,
    }),
    listLeagues(),
    getTeamPickerCatalog(user),
  ]);

  const { todayHref, monthHref } = buildGridViewHrefs(rawParams);
  const { previousDateHref, nextDateHref } = buildGridDateStepHrefs(rawParams, filters);
  const rows = toPlanillaRows(dayGroups.flatMap((group) => group.items));
  const teams = [...new Set(teamCatalog.teams.map((team) => team.name))];

  return (
    <div className="min-w-0 space-y-6">
      {/* The ficha opened from a row links back here, not to bare /grid. */}
      <Suspense fallback={null}>
        <GridReturnRecorder />
      </Suspense>
      <SectionPageHeader
        title="Planilla"
        description="La grilla como planilla: escribí, pegá y elegí de las listas. Cada cambio se guarda solo."
        descriptionClassName="hidden sm:block"
        actions={
          <span className="hidden sm:inline-flex">
            <GridStatsButton timezone={filters.timezone} />
          </span>
        }
      />

      <div className="flex flex-wrap items-center justify-end gap-3">
        <GridSearchField
          planilla
          filters={filters}
          hasExplicitDisplay={false}
          className="min-w-[16rem] max-w-md"
        />
        <GridDisplayToggle
          display="planilla"
          baseSearchParams={toStringGridSearchParams(rawParams)}
        />
        <SegmentedControl
          items={[
            {
              key: "day",
              label: "Hoy",
              href: toPlanillaHref(todayHref),
              active: filters.view === "day",
            },
            {
              key: "month",
              label: "Mes",
              href: toPlanillaHref(monthHref),
              active: filters.view === "month",
            },
          ]}
        />
        <GridDateStepper
          prevHref={toPlanillaHref(previousDateHref)}
          nextHref={toPlanillaHref(nextDateHref)}
          dateLabel={formatGridDateLabel(filters)}
        />
      </div>

      <GridPlanilla
        key={`${filters.view}:${filters.date}:${filters.q}`}
        rows={rows}
        people={owners.map((owner) => ({
          id: owner.id,
          name: owner.full_name,
          functions: owner.functions,
        }))}
        leagues={leagues.map((league) => league.name)}
        teams={teams}
        canEdit={user.canEdit}
        year={Number(filters.date.slice(0, 4))}
        timezone={filters.timezone}
        todayKey={toDateKey(new Date().toISOString(), filters.timezone)}
        columnOrderKey={`basket-production.planilla.columns.v1:${user.userId ?? "anon"}`}
      />
    </div>
  );
}
