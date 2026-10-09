import { Suspense, type ReactNode } from "react";

import { FixturesAgenda } from "@/components/fixtures/fixtures-agenda";
import { GridDateStepper } from "@/components/grid/grid-date-stepper";
import { SectionPageHeader } from "@/components/layout/section-page-header";
import { Card } from "@/components/ui/card";
import { requireUserContext } from "@/lib/auth";
import { getFixturesAgenda } from "@/lib/data/fixtures";
import { addFixtureMonths, parseFixtureMonth } from "@/lib/fixtures/window";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function formatMonthLabel(month: string) {
  return new Date(`${month}-15T12:00:00Z`)
    .toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" })
    .toUpperCase();
}

export default async function FixturesPage({ searchParams }: PageProps) {
  const month = parseFixtureMonth((await searchParams).month, new Date());
  const monthNav = (
    <GridDateStepper
      key="month-nav"
      prevHref={`/fixtures?month=${addFixtureMonths(month, -1)}`}
      nextHref={`/fixtures?month=${addFixtureMonths(month, 1)}`}
      dateLabel={formatMonthLabel(month)}
      className="w-full md:w-72"
    />
  );

  return (
    <div className="space-y-6">
      <SectionPageHeader
        title="Fixtures"
        description="Todos los partidos de las ligas que seguimos (CABB, ACB y otras), los cubra BP o no. Los que cubrimos están en la grilla."
      />

      <Suspense key={month} fallback={<FixturesAgendaSkeleton monthNav={monthNav} />}>
        <FixturesAgendaSection month={month} monthNav={monthNav} />
      </Suspense>
    </div>
  );
}

async function FixturesAgendaSection({ month, monthNav }: { month: string; monthNav: ReactNode }) {
  const user = await requireUserContext();
  const { today, fixtures, truncated } = await getFixturesAgenda(user, { now: new Date(), month });

  return <FixturesAgenda fixtures={fixtures} today={today} truncated={truncated} monthNav={monthNav} />;
}

function FixturesAgendaSkeleton({ monthNav }: { monthNav: ReactNode }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      {monthNav}
      <div className="h-9 w-full max-w-xl animate-pulse rounded-[var(--panel-radius)] bg-[var(--background-soft)]" />
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index} className="h-40 animate-pulse" />
      ))}
    </div>
  );
}
