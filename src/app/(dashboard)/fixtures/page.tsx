import { Suspense } from "react";

import { formatInTimeZone } from "date-fns-tz";

import { FixturesAgenda } from "@/components/fixtures/fixtures-agenda";
import { GridDateStepper } from "@/components/grid/grid-date-stepper";
import { SectionPageHeader } from "@/components/layout/section-page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireUserContext } from "@/lib/auth";
import { getFixturesAgenda } from "@/lib/data/fixtures";
import { FIXTURE_TIMEZONE } from "@/lib/fixtures/schedule";
import { getLastFixturesSync } from "@/lib/fixtures/sync";
import { addFixtureMonths, parseFixtureMonth } from "@/lib/fixtures/window";
import { cn } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// The daily run is at 06:00; past 30 h the pill flags a missed run.
const STALE_AFTER_MS = 30 * 60 * 60 * 1000;

function formatMonthLabel(month: string) {
  return new Date(`${month}-15T12:00:00Z`)
    .toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" })
    .toUpperCase();
}

export default async function FixturesPage({ searchParams }: PageProps) {
  const month = parseFixtureMonth((await searchParams).month, new Date());

  return (
    <div className="space-y-6 p-6">
      <SectionPageHeader
        title="Fixtures"
        description="Todos los partidos de la CABB, los cubra BP o no. Los que cubrimos están en la grilla."
        actions={
          <Suspense fallback={null}>
            <FixturesSyncPill />
          </Suspense>
        }
      />

      <GridDateStepper
        prevHref={`/fixtures?month=${addFixtureMonths(month, -1)}`}
        nextHref={`/fixtures?month=${addFixtureMonths(month, 1)}`}
        dateLabel={formatMonthLabel(month)}
        className="max-w-xs"
      />

      <Suspense key={month} fallback={<FixturesAgendaSkeleton />}>
        <FixturesAgendaSection month={month} />
      </Suspense>
    </div>
  );
}

async function FixturesAgendaSection({ month }: { month: string }) {
  const user = await requireUserContext();
  const { today, fixtures, truncated } = await getFixturesAgenda(user, { now: new Date(), month });

  return <FixturesAgenda fixtures={fixtures} today={today} truncated={truncated} />;
}

async function FixturesSyncPill() {
  const last = await getLastFixturesSync();
  const now = new Date();
  const stale = !last || now.getTime() - new Date(last).getTime() > STALE_AFTER_MS;
  const nextRun = formatInTimeZone(now, FIXTURE_TIMEZONE, "HH:mm") < "06:00" ? "hoy 06:00" : "mañana 06:00";

  return (
    <Badge className="gap-2 bg-[var(--surface)] text-xs font-normal normal-case tracking-normal text-[var(--n-600)]">
      <span
        className={cn(
          "size-2 rounded-full",
          stale ? "bg-[var(--accent)]" : "bg-[var(--ok)] shadow-[0_0_0_3px_var(--ok-soft)]",
        )}
      />
      {last ? (
        <>
          Actualizado{" "}
          <b className="font-medium text-[var(--n-800)]">
            {formatInTimeZone(last, FIXTURE_TIMEZONE, "dd/MM HH:mm")}
          </b>
        </>
      ) : (
        "Sin sincronizar todavía"
      )}
      <span title="Sincronización automática diaria desde Gesdeportiva (CABB)">· próxima {nextRun}</span>
    </Badge>
  );
}

function FixturesAgendaSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="h-10 w-full max-w-xl animate-pulse rounded-[var(--panel-radius)] bg-[var(--background-soft)]" />
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index} className="h-40 animate-pulse" />
      ))}
    </div>
  );
}
