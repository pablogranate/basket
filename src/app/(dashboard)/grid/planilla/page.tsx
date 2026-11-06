import Link from "next/link";
import { addMonths, format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";

import { GridDateStepper } from "@/components/grid/grid-date-stepper";
import { GridPlanilla } from "@/components/grid/planilla/grid-planilla";
import { SectionPageHeader } from "@/components/layout/section-page-header";
import { requireUserContext } from "@/lib/auth";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { getGridData } from "@/lib/data/dashboard";
import { toPlanillaRows } from "@/lib/grid/planilla";
import { listLeagues } from "@/lib/leagues/leagues";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function resolveMonth(raw: string | string[] | undefined) {
  const value = typeof raw === "string" ? raw : "";
  return /^\d{4}-\d{2}$/.test(value)
    ? value
    : formatInTimeZone(new Date(), DEFAULT_TIMEZONE, "yyyy-MM");
}

export default async function GridPlanillaPage({ searchParams }: PageProps) {
  const month = resolveMonth((await searchParams).mes);
  const user = await requireUserContext();

  const [{ dayGroups, owners }, leagues] = await Promise.all([
    getGridData(user, {
      view: "month",
      date: `${month}-01`,
      q: "",
      league: "",
      mode: "",
      status: "",
      owner: "",
      timezone: DEFAULT_TIMEZONE,
    }),
    listLeagues(),
  ]);

  const monthDate = parse(`${month}-01`, "yyyy-MM-dd", new Date());
  const monthLabel = format(monthDate, "MMMM yyyy", { locale: es }).toUpperCase();
  const prevHref = `/grid/planilla?mes=${format(addMonths(monthDate, -1), "yyyy-MM")}`;
  const nextHref = `/grid/planilla?mes=${format(addMonths(monthDate, 1), "yyyy-MM")}`;

  const rows = toPlanillaRows(dayGroups.flatMap((group) => group.items));

  return (
    <div className="min-w-0 space-y-6">
      <SectionPageHeader
        title="Planilla"
        description="La grilla como planilla: escribí, pegá y elegí de las listas. Cada cambio se guarda solo."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/grid?display=table&view=month"
              className="text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Volver a la grilla
            </Link>
            <GridDateStepper prevHref={prevHref} nextHref={nextHref} dateLabel={monthLabel} />
          </div>
        }
      />
      <GridPlanilla
        key={month}
        rows={rows}
        people={owners.map((owner) => ({
          id: owner.id,
          name: owner.full_name,
          functions: owner.functions,
        }))}
        leagues={leagues.map((league) => league.name)}
        canEdit={user.canEdit}
        year={monthDate.getFullYear()}
        timezone={DEFAULT_TIMEZONE}
      />
    </div>
  );
}
