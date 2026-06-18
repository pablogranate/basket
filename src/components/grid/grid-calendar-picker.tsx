"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, parse, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import type { GridCalendarDaySummary } from "@/lib/data/dashboard";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["D", "L", "M", "M", "J", "V", "S"];

const LEAGUE_DOT_STYLES = [
  {
    label: "Liga Argentina",
    match: ["liga argentina"],
    dotClassName: "bg-[#2563eb]",
  },
  {
    label: "Liga Próximo",
    match: ["liga proximo", "liga próximo"],
    dotClassName: "bg-[#16a34a]",
  },
  {
    label: "Liga Nacional",
    match: ["liga nacional"],
    dotClassName: "bg-[#dc2626]",
  },
  {
    label: "Liga Femenina",
    match: ["liga femenina"],
    dotClassName: "bg-[#c026d3]",
  },
  {
    label: "Liga Federal",
    match: ["liga federal"],
    dotClassName: "bg-[#ea580c]",
  },
  {
    label: "Otros",
    match: [],
    dotClassName: "bg-[#94a3b8]",
  },
] as const;

function getMonthDate(month: string) {
  return parse(`${month}-01`, "yyyy-MM-dd", new Date());
}

function getLeagueDotClass(competition: string) {
  const normalizedCompetition = competition.toLowerCase();

  return (
    LEAGUE_DOT_STYLES.find(
      (entry) =>
        entry.match.length &&
        entry.match.some((match) => normalizedCompetition.includes(match)),
    )?.dotClassName ?? "bg-[#94a3b8]"
  );
}

function buildCompetitionDots(summary?: GridCalendarDaySummary | null) {
  if (!summary) {
    return { dots: [] as string[], overflow: 0 };
  }

  const dots: string[] = [];

  const sortedCompetitions = Object.entries(summary.competitions).sort(
    (left, right) => right[1] - left[1],
  );

  for (const [competition, count] of sortedCompetitions) {
    for (let index = 0; index < count; index += 1) {
      dots.push(competition);
    }
  }
  const visibleDots = dots.slice(0, 10);

  return {
    dots: visibleDots,
    overflow: Math.max(summary.total - visibleDots.length, 0),
  };
}

export function GridCalendarPicker({
  selectedDate,
  initialMonth,
  initialSummary,
  baseSearchParams,
}: {
  selectedDate?: string | null;
  initialMonth: string;
  // Optional: when omitted the popover fetches its first month lazily on open
  // (via handleToggle), so the grid page never blocks first paint on a
  // month-wide calendar scan most users never trigger.
  initialSummary?: GridCalendarDaySummary[];
  baseSearchParams: Record<string, string>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);
  const baseParamsString = useMemo(
    () => new URLSearchParams(baseSearchParams).toString(),
    [baseSearchParams],
  );

  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(initialMonth);
  const [loadingMonth, setLoadingMonth] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, GridCalendarDaySummary[]>>(
    initialSummary ? { [initialMonth]: initialSummary } : {},
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  async function loadMonth(targetMonth: string) {
    if (cache[targetMonth]) {
      return;
    }

    const params = new URLSearchParams(baseParamsString);
    params.set("calendarMonth", targetMonth);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setLoadingMonth(targetMonth);
    setError(null);

    try {
      const response = await fetch(`/api/grid/calendar?${params.toString()}`, {
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw new Error("No pudimos cargar el calendario.");
      }

      const payload = (await response.json()) as {
        month: string;
        days: GridCalendarDaySummary[];
      };

      if (requestIdRef.current !== requestId) {
        return;
      }

      setCache((current) => ({
        ...current,
        [payload.month]: payload.days,
      }));
    } catch (requestError) {
      if (requestIdRef.current !== requestId) {
        return;
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "No pudimos cargar el calendario.",
      );
    } finally {
      if (requestIdRef.current === requestId) {
        setLoadingMonth((current) => (current === targetMonth ? null : current));
      }
    }
  }

  const currentMonthDate = useMemo(() => getMonthDate(month), [month]);
  const today = useMemo(() => new Date(), []);
  const summaryByDay = useMemo(
    () =>
      new Map(
        (cache[month] ?? []).map((item) => [item.date, item] as const),
      ),
    [cache, month],
  );
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonthDate), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonthDate), { weekStartsOn: 0 });

    return eachDayOfInterval({ start, end });
  }, [currentMonthDate]);

  function goToDate(date: Date) {
    const params = new URLSearchParams(baseParamsString);
    params.set("view", "day");
    params.set("date", format(date, "yyyy-MM-dd"));
    params.set("calendarMonth", format(date, "yyyy-MM"));
    params.delete("intent");
    params.delete("notice");

    const query = params.toString();
    setOpen(false);
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function handleToggle() {
    const nextOpen = !open;
    setOpen(nextOpen);

    if (nextOpen && !cache[month]) {
      void loadMonth(month);
    }
  }

  function handleMonthChange(direction: "prev" | "next") {
    const nextMonth = format(
      direction === "prev"
        ? subMonths(currentMonthDate, 1)
        : addMonths(currentMonthDate, 1),
      "yyyy-MM",
    );

    setMonth(nextMonth);

    if (!cache[nextMonth]) {
      void loadMonth(nextMonth);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Abrir calendario de producción"
        onClick={handleToggle}
        className={cn(
          "panel-surface inline-flex size-[52px] items-center justify-center rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] text-[#607089] transition hover:text-[var(--accent)]",
          open && "border-[rgba(230,18,56,0.2)] text-[var(--accent)]",
        )}
      >
        <CalendarDays className="size-5" />
      </button>

      {open ? (
        <div className="panel-surface absolute right-0 top-[calc(100%+0.75rem)] z-30 w-[31rem] max-w-[calc(100vw-2rem)] border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => handleMonthChange("prev")}
              className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background-soft)] text-[#607089] transition hover:border-[rgba(230,18,56,0.18)] hover:text-[var(--accent)]"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
                Calendario
              </p>
              <p className="mt-1 text-base font-extrabold text-[var(--foreground)]">
                {format(currentMonthDate, "MMMM yyyy", { locale: es })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleMonthChange("next")}
              className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background-soft)] text-[#607089] transition hover:border-[rgba(230,18,56,0.18)] hover:text-[var(--accent)]"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="px-2 py-1 text-center text-[10px] font-black uppercase tracking-[0.18em] text-[#94a3b8]"
              >
                {label}
              </div>
            ))}

            {calendarDays.map((day) => {
              const dateKey = format(day, "yyyy-MM-dd");
              const isCurrentMonth = isSameMonth(day, currentMonthDate);
              const isSelected =
                selectedDate ? isSameDay(day, parse(selectedDate, "yyyy-MM-dd", new Date())) : false;
              const isToday = isSameDay(day, today);
              const summary = summaryByDay.get(dateKey);
              const { dots, overflow } = buildCompetitionDots(summary);

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => goToDate(day)}
                  disabled={!isCurrentMonth}
                  className={cn(
                    "panel-radius min-h-[4.5rem] border px-2 py-2 text-left transition",
                    isCurrentMonth
                      ? "border-[#edf1f6] bg-white hover:border-[rgba(230,18,56,0.2)] hover:bg-[#fff8fa]"
                      : "border-transparent bg-transparent opacity-35",
                    isSelected &&
                      "border-[rgba(230,18,56,0.28)] bg-[#fff1f4] ring-1 ring-[rgba(230,18,56,0.2)]",
                    isToday && !isSelected && "border-[#dbe1ea] bg-[#f7f9fc]",
                  )}
                >
                  <span
                    className={cn(
                      "text-sm font-bold",
                      isSelected
                        ? "text-[var(--accent)]"
                        : isCurrentMonth
                          ? "text-[var(--foreground)]"
                          : "text-[#94a3b8]",
                    )}
                  >
                    {format(day, "d")}
                  </span>

                  <div className="mt-2 flex min-h-[1.5rem] flex-wrap items-center gap-1">
                    {dots.map((mode, index) => (
                      <span
                        key={`${dateKey}-${mode}-${index}`}
                        className={cn(
                          "size-1.5 rounded-full",
                          getLeagueDotClass(mode),
                        )}
                      />
                    ))}
                    {overflow ? (
                      <span className="text-[9px] font-bold text-[#94a3b8]">
                        +{overflow}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 border-t border-[var(--border)] pt-3">
            <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#94a3b8]">
              {LEAGUE_DOT_STYLES.map((league) => (
                <span key={league.label} className="inline-flex items-center gap-1.5">
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      league.dotClassName,
                    )}
                  />
                  {league.label}
                </span>
              ))}
            </div>
            {loadingMonth === month ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#94a3b8]">
                <Loader2 className="size-3 animate-spin" />
                Cargando
              </span>
            ) : null}
          </div>

          {error ? (
            <p className="mt-3 text-xs font-medium text-[#9f1633]">{error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
