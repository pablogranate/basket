import { Suspense } from "react";

import { formatInTimeZone } from "date-fns-tz";

import { FixturesAgenda } from "@/components/fixtures/fixtures-agenda";
import { SectionPageHeader } from "@/components/layout/section-page-header";
import { requireUserContext } from "@/lib/auth";
import { getFixturesAgenda } from "@/lib/data/fixtures";
import { FIXTURE_TIMEZONE } from "@/lib/fixtures/link-plan";
import { getLastFixturesSync } from "@/lib/fixtures/sync";
import { cn } from "@/lib/utils";

// The daily run is at 06:00; past 30 h the pill flags a missed run.
const STALE_AFTER_MS = 30 * 60 * 60 * 1000;

export default function FixturesPage() {
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

      <Suspense fallback={<FixturesAgendaSkeleton />}>
        <FixturesAgendaSection />
      </Suspense>
    </div>
  );
}

async function FixturesAgendaSection() {
  const user = await requireUserContext();
  const { today, fixtures, truncated } = await getFixturesAgenda(user, new Date());

  return <FixturesAgenda fixtures={fixtures} today={today} truncated={truncated} />;
}

async function FixturesSyncPill() {
  const last = await getLastFixturesSync();
  const now = new Date();
  const stale = !last || now.getTime() - new Date(last).getTime() > STALE_AFTER_MS;
  const nextRun = formatInTimeZone(now, FIXTURE_TIMEZONE, "HH:mm") < "06:00" ? "hoy 06:00" : "mañana 06:00";

  return (
    <span
      title="Sincronización automática diaria desde Gesdeportiva (CABB)"
      className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--n-600)]"
    >
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
      <span>· próxima {nextRun}</span>
    </span>
  );
}

function FixturesAgendaSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="h-10 w-full max-w-xl animate-pulse rounded-[var(--panel-radius)] bg-[var(--background-soft)]" />
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-40 animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]"
        />
      ))}
    </div>
  );
}
