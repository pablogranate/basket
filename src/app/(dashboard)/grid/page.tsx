import { Suspense } from "react";
import { addDays, addMonths } from "date-fns";
import { ArrowUpDown } from "lucide-react";

import { GridDateStepper } from "@/components/grid/grid-date-stepper";
import { GridDisplayToggle } from "@/components/grid/grid-display-toggle";
import { GridPageShell } from "@/components/grid/grid-page-shell";
import { GridPastDaysProvider } from "@/components/grid/grid-past-days-context";
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
import { ToolbarSearchField } from "@/components/ui/toolbar-search-field";
import { SECTION_COPY } from "@/lib/copy";
import {
  buildKickoffAt,
  formatMatchDate,
  getDateInputValue,
  getMonthInputValue,
} from "@/lib/date";
import { requireUserContext } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { parseGridSearchParams, parseNotice } from "@/lib/search-params";
import { cn } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function serializeSearchParams(params: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(params)) {
    if (typeof rawValue === "string" && rawValue) {
      search.set(key, rawValue);
    }
  }

  const query = search.toString();
  return query ? `/grid?${query}` : "/grid";
}

function toStringSearchParams(
  params: Record<string, string | string[] | undefined>,
) {
  const result: Record<string, string> = {};

  for (const [key, rawValue] of Object.entries(params)) {
    if (typeof rawValue === "string" && rawValue) {
      result[key] = rawValue;
    }
  }

  return result;
}

function buildGridHref(
  params: Record<string, string | string[] | undefined>,
  updates: Record<string, string | undefined>,
) {
  const search = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(params)) {
    if (typeof rawValue === "string" && rawValue) {
      search.set(key, rawValue);
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (!value) {
      search.delete(key);
      continue;
    }

    search.set(key, value);
  }

  search.delete("intent");
  search.delete("notice");

  const query = search.toString();
  return query ? `/grid?${query}` : "/grid";
}

function buildGridDateShift(params: {
  date: string;
  view: "day" | "month";
  amount: number;
}) {
  const baseDate =
    params.view === "month"
      ? new Date(`${params.date}-01T12:00:00`)
      : new Date(`${params.date}T12:00:00`);
  const shiftedDate =
    params.view === "month"
      ? addMonths(baseDate, params.amount)
      : addDays(baseDate, params.amount);

  return params.view === "month"
    ? getMonthInputValue(shiftedDate)
    : getDateInputValue(shiftedDate);
}

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
  const redirectTo = serializeSearchParams(resolvedSearchParams);
  const baseSearchParams = toStringSearchParams(resolvedSearchParams);
  const todayHref = buildGridHref(resolvedSearchParams, {
    view: "day",
    date: getDateInputValue(),
  });
  const monthHref = buildGridHref(resolvedSearchParams, {
    view: "month",
    date: getMonthInputValue(),
  });
  const previousDateHref = buildGridHref(resolvedSearchParams, {
    date: buildGridDateShift({
      date: filters.date,
      view: filters.view,
      amount: -1,
    }),
  });
  const nextDateHref = buildGridHref(resolvedSearchParams, {
    date: buildGridDateShift({
      date: filters.date,
      view: filters.view,
      amount: 1,
    }),
  });
  const summaryDateLabel = formatSummaryDateLabel({
    date: filters.date,
    view: filters.view,
    timezone: filters.timezone,
  });
  const dateOrderToggleHref = buildGridHref(resolvedSearchParams, {
    dateOrder: filters.dateOrder === "asc" ? "desc" : "asc",
  });
  const hasExplicitDisplay =
    typeof resolvedSearchParams.display === "string" &&
    resolvedSearchParams.display.length > 0;

  const searchHiddenInputs = (
    <>
      <input type="hidden" name="view" value={filters.view} />
      <input type="hidden" name="date" value={filters.date} />
      <input type="hidden" name="dateOrder" value={filters.dateOrder} />
      {hasExplicitDisplay ? (
        <input type="hidden" name="display" value={filters.display} />
      ) : null}
      {filters.league ? (
        <input type="hidden" name="league" value={filters.league} />
      ) : null}
      {filters.mode ? (
        <input type="hidden" name="mode" value={filters.mode} />
      ) : null}
      {filters.status ? (
        <input type="hidden" name="status" value={filters.status} />
      ) : null}
      {filters.owner ? (
        <input type="hidden" name="owner" value={filters.owner} />
      ) : null}
      {filters.timezone ? (
        <input type="hidden" name="timezone" value={filters.timezone} />
      ) : null}
    </>
  );

  const sortToggleLabel =
    filters.dateOrder === "asc"
      ? "Ordenar desde la fecha más reciente"
      : "Ordenar desde la fecha más antigua";
  const sortToggleClassName = cn(
    "inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[#7f8ca0] shadow-[0_8px_18px_rgba(15,23,42,0.06)] transition hover:border-[rgba(230,18,56,0.24)] hover:text-[var(--accent)]",
    filters.dateOrder === "desc" &&
      "border-[rgba(230,18,56,0.18)] bg-[#fff4f6] text-[var(--accent)]",
  );

  const searchField = (
    <ToolbarSearchField
      action="/grid"
      className="w-full"
      defaultValue={filters.q}
      placeholder="Buscar partido, ID, liga o responsable..."
    >
      {searchHiddenInputs}
    </ToolbarSearchField>
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
            <Suspense fallback={<GridHeaderActionsSkeleton />}>
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
                <a
                  href={dateOrderToggleHref}
                  aria-label={sortToggleLabel}
                  className={sortToggleClassName}
                >
                  <ArrowUpDown className="size-4" />
                </a>
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

          <Suspense fallback={<GridContentSkeleton />}>
            <GridContent
              user={user}
              filters={filters}
              redirectTo={redirectTo}
              pastDaysAccessory={
                <a
                  href={dateOrderToggleHref}
                  aria-label={sortToggleLabel}
                  className={cn(sortToggleClassName, "sm:hidden")}
                >
                  <ArrowUpDown className="size-4" />
                </a>
              }
            />
          </Suspense>
          </section>
        </GridPastDaysProvider>
      </div>
    </GridPageShell>
  );
}
