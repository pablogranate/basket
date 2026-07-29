import { Suspense } from "react";

import { GridDateOrderToggle } from "@/components/grid/grid-date-order-toggle";
import { GridDateStepper } from "@/components/grid/grid-date-stepper";
import { GridDisplayToggle } from "@/components/grid/grid-display-toggle";
import { GridPageShell } from "@/components/grid/grid-page-shell";
import { GridPastDaysProvider } from "@/components/grid/grid-past-days-context";
import { GridSearchField } from "@/components/grid/grid-search-field";
import {
  GridContent,
  GridContentSkeleton,
  GridCountSkeleton,
  GridExportAction,
  GridHeaderActionsSkeleton,
  GridHeaderDataActions,
  GridInsightsAside,
  GridInsightsSkeleton,
  GridMatchCount,
  GridPastDaysToolbarButton,
} from "@/components/grid/grid-regions";
import { SectionPageHeader } from "@/components/layout/section-page-header";
import { SetupPanel } from "@/components/layout/setup-panel";
import { PageMessage } from "@/components/ui/page-message";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SECTION_COPY } from "@/lib/copy";
import { buildKickoffAt, formatMatchDate } from "@/lib/date";
import {
  buildGridDateOrderHref,
  buildGridDateStepHrefs,
  buildGridViewHrefs,
  serializeGridSearchParams,
  toStringGridSearchParams,
} from "@/lib/grid/nav-hrefs";
import { requireUserContext } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { parseGridSearchParams, parseNotice } from "@/lib/search-params";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function formatSummaryDateLabel(params: {
  date: string;
  view: "day" | "month";
  timezone: string;
}) {
  const referenceDate =
    params.view === "month" ? `${params.date}-01` : params.date;
  const referenceKickoff = buildKickoffAt({
    date: referenceDate,
    time: "12:00",
    timezone: params.timezone,
  });
  const label = formatMatchDate(
    referenceKickoff,
    params.timezone,
    params.view === "month" ? "MMM yyyy" : "EEEE, d 'de' MMM",
  );

  return label.replaceAll(".", "").toUpperCase();
}

export default async function GridPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const { intent, notice } = parseNotice(resolvedSearchParams);

  if (!isSupabaseConfigured) {
    return <SetupPanel />;
  }

  const user = await requireUserContext();
  const filters = parseGridSearchParams(resolvedSearchParams);
  const redirectTo = serializeGridSearchParams(resolvedSearchParams);
  const baseSearchParams = toStringGridSearchParams(resolvedSearchParams);
  const { todayHref, monthHref } = buildGridViewHrefs(resolvedSearchParams);
  const { previousDateHref, nextDateHref } = buildGridDateStepHrefs(
    resolvedSearchParams,
    filters,
  );
  const summaryDateLabel = formatSummaryDateLabel({
    date: filters.date,
    view: filters.view,
    timezone: filters.timezone,
  });
  const dateOrderToggleHref = buildGridDateOrderHref(
    resolvedSearchParams,
    filters.dateOrder,
  );
  const hasExplicitDisplay =
    typeof resolvedSearchParams.display === "string" &&
    resolvedSearchParams.display.length > 0;

  const searchField = (
    <GridSearchField
      filters={filters}
      hasExplicitDisplay={hasExplicitDisplay}
      className="w-full"
    />
  );

  return (
    <GridPageShell
      aside={
        <Suspense fallback={<GridInsightsSkeleton />}>
          <GridInsightsAside
            user={user}
            filters={filters}
            currentDateLabel={summaryDateLabel}
            previousDateHref={previousDateHref}
            nextDateHref={nextDateHref}
          />
        </Suspense>
      }
    >
      <div className="relative z-0 min-w-0 space-y-10">
        <SectionPageHeader
          title={SECTION_COPY.grid.title}
          description={SECTION_COPY.grid.description}
          descriptionClassName="hidden sm:block"
          className="gap-4"
          actions={
            <Suspense fallback={<GridHeaderActionsSkeleton canEdit={user.canEdit} />}>
              <GridHeaderDataActions
                user={user}
                filters={filters}
                redirectTo={redirectTo}
              />
            </Suspense>
          }
        />

        <PageMessage intent={intent} message={notice} />

        <GridPastDaysProvider>
          <section className="min-w-0 space-y-6">
          {/* Desktop/tablet toolbar — two columns. Left: date-order + match
              count (the "Ver días anteriores" toggle sits below it in the
              list). Right: the search bar stacked over the controls, sized to
              match that control cluster. */}
          <div className="hidden items-start justify-between gap-4 sm:flex">
            <div className="flex shrink-0 flex-col gap-3">
              <div className="flex items-center gap-3">
                <GridDateOrderToggle
                  href={dateOrderToggleHref}
                  dateOrder={filters.dateOrder}
                />
                <Suspense fallback={<GridCountSkeleton />}>
                  <GridMatchCount user={user} filters={filters} />
                </Suspense>
              </div>
              <Suspense fallback={null}>
                <GridPastDaysToolbarButton user={user} filters={filters} />
              </Suspense>
            </div>
            <div className="flex min-w-0 flex-col items-stretch gap-3">
              {searchField}
              <div className="flex flex-wrap items-center justify-end gap-3">
                <GridDisplayToggle
                  display={filters.display}
                  hasExplicitParam={hasExplicitDisplay}
                  baseSearchParams={baseSearchParams}
                />
                <SegmentedControl
                  items={[
                    { key: "day", label: "Hoy", href: todayHref, active: filters.view === "day" },
                    { key: "month", label: "Mes", href: monthHref, active: filters.view === "month" },
                  ]}
                />
                <GridDateStepper
                  prevHref={previousDateHref}
                  nextHref={nextDateHref}
                  dateLabel={summaryDateLabel}
                />
                <Suspense fallback={null}>
                  <GridExportAction
                    user={user}
                    filters={filters}
                    summaryDateLabel={summaryDateLabel}
                  />
                </Suspense>
              </div>
            </div>
          </div>

          {/* Phone nav bar: full-width search, then day stepper + export. The
              sort toggle rides with "Ver días anteriores" inside the list. */}
          <div className="space-y-3 sm:hidden">
            {searchField}
            <div className="flex items-center gap-2">
              <GridDateStepper
                className="flex-1"
                prevHref={previousDateHref}
                nextHref={nextDateHref}
                dateLabel={summaryDateLabel}
              />
              <Suspense fallback={null}>
                <GridExportAction
                  user={user}
                  filters={filters}
                  summaryDateLabel={summaryDateLabel}
                />
              </Suspense>
            </div>
          </div>

          <Suspense fallback={<GridContentSkeleton display={filters.display} />}>
            <GridContent
              user={user}
              filters={filters}
              redirectTo={redirectTo}
              pastDaysAccessory={
                <GridDateOrderToggle
                  href={dateOrderToggleHref}
                  dateOrder={filters.dateOrder}
                  className="sm:hidden"
                />
              }
            />
          </Suspense>
          </section>
        </GridPastDaysProvider>
      </div>
    </GridPageShell>
  );
}
