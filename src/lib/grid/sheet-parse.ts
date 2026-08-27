import { parse } from "csv-parse/sync";
import { fromZonedTime } from "date-fns-tz";

export const TIMEZONE = "America/Argentina/Buenos_Aires";
const DEFAULT_DURATION_MINUTES = 150;

// Rolling window the sync operates on: today through the next 30 days.
const SYNC_WINDOW_DAYS = 30;

// First tab that uses the Local/Visitante columns. Earlier tabs still carry the
// retired single "Partido" column, so they must never be fetched or parsed.
// See ADR 0001 (format switch) and ADR 0003 (cutover floor).
const FORMAT_CUTOVER = { year: 2026, month: 7 }; // Julio 26

const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export const ROLE_COLUMN_MAP: Record<string, string> = {
  "responsable en cancha": "Responsable",
  realizador: "Realizador",
  "operador de grafica": "Operador de Grafica",
  "camara 1": "Camara 1",
  "camara 2": "Camara 2",
  "camara 3": "Camara 3",
  "camara 4": "Camara 4",
  "camara 5": "Camara 5",
  relator: "Relator",
  "comentarista 1": "Comentario 1",
  "comentarista 2": "Comentario 2",
  "operador de control": "Operador de Control",
  "soporte tecnico": "Soporte tecnico",
};

export const SHEET_MANAGED_ROLE_NAMES = Object.values(ROLE_COLUMN_MAP);

export type SheetMatch = {
  competition: string | null;
  production_mode: string | null;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  duration_minutes: number;
  timezone: string;
  production_code: string | null;
  commentary_plan: string | null;
  transport: string | null;
  notes: string | null;
};

export type SheetEntry = {
  tabName: string;
  match: SheetMatch;
  responsable: string;
  assignments: Array<{ roleName: string; personName: string }>;
};

// --- parsing helpers (ported from tools/import/grilla.mjs) ---

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

export function parseTabPeriod(tabName: string) {
  const parts = tabName.trim().split(/\s+/);
  const month = MONTHS[normalizeHeader(parts[0])];
  const year = 2000 + Number(parts[1]);

  if (!month || Number.isNaN(year)) {
    throw new Error(`No se pudo interpretar mes/año de la pestaña "${tabName}".`);
  }

  return { month, year };
}

function parseDayMarker(value: unknown) {
  const match = String(value ?? "")
    .trim()
    .match(/(\d{1,2})\s*$/);
  return match ? Number(match[1]) : null;
}

function toKickoffAt({
  year,
  month,
  day,
  time,
}: {
  year: number;
  month: number;
  day: number;
  time: string;
}) {
  const normalizedTime = /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : "00:00";
  const monthValue = String(month).padStart(2, "0");
  const dayValue = String(day).padStart(2, "0");
  const localDateTime = `${year}-${monthValue}-${dayValue}T${normalizedTime}:00`;
  return fromZonedTime(localDateTime, TIMEZONE).toISOString();
}

function buildNotes(observacion: string, transporte: string) {
  return [observacion, transporte].map((value) => value.trim()).filter(Boolean).join("\n") || null;
}

export function parseTab(tabName: string, csvSource: string): SheetEntry[] {
  const { month, year } = parseTabPeriod(tabName);
  const rows = parse(csvSource, { relax_column_count: true }) as string[][];

  if (!rows.length) {
    return [];
  }

  const headers = rows[0].map(normalizeHeader);
  const columnIndex = new Map<string, number>();

  headers.forEach((header, index) => {
    if (!columnIndex.has(header)) {
      columnIndex.set(header, index);
    }
  });

  const readCell = (row: string[], header: string) => {
    const index = columnIndex.get(header);
    return index === undefined ? "" : String(row[index] ?? "").trim();
  };

  let currentDay = parseDayMarker(rows[0][0]);
  const entries: SheetEntry[] = [];

  for (const row of rows.slice(1)) {
    const dayMarker = parseDayMarker(row[0]);
    if (dayMarker) {
      currentDay = dayMarker;
    }

    const home = readCell(row, "local");
    if (!home) {
      continue;
    }

    if (!currentDay) {
      continue;
    }

    const away = readCell(row, "visitante");
    const kickoffAt = toKickoffAt({ year, month, day: currentDay, time: readCell(row, "hora") });

    const assignments: Array<{ roleName: string; personName: string }> = [];
    for (const [header, roleName] of Object.entries(ROLE_COLUMN_MAP)) {
      const personName = readCell(row, header);
      if (personName) {
        assignments.push({ roleName, personName });
      }
    }

    entries.push({
      tabName,
      match: {
        competition: readCell(row, "liga") || null,
        production_mode: readCell(row, "produccion") || null,
        home_team: home,
        away_team: away,
        kickoff_at: kickoffAt,
        duration_minutes: DEFAULT_DURATION_MINUTES,
        timezone: TIMEZONE,
        production_code: readCell(row, "id") || null,
        commentary_plan: readCell(row, "relatos/comentarios") || null,
        transport: readCell(row, "transporte") || null,
        notes: buildNotes(readCell(row, "observacion"), readCell(row, "transporte")),
      },
      responsable: readCell(row, "responsable en cancha"),
      assignments,
    });
  }

  return entries;
}

// Start of "today" in the sheet timezone, as an instant. Entries with a
// kickoff before this are in the past and must not be synced/changed.
export function startOfTodayInTimezone(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return fromZonedTime(`${parts}T00:00:00`, TIMEZONE);
}

// Exclusive end of the rolling sync window, as an instant. Fixed 24h-day math
// is exact because Argentina observes no DST (see ADR 0002).
export function endOfSyncWindow(now: Date): Date {
  return new Date(
    startOfTodayInTimezone(now).getTime() + SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
}

// Calendar year + month (1-12) of an instant, read in the sheet timezone.
export function zonedYearMonth(instant: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(instant);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return { year, month };
}

// True when (year, month) is strictly before the Local/Visitante cutover.
function isBeforeCutover(year: number, month: number): boolean {
  return (
    year < FORMAT_CUTOVER.year ||
    (year === FORMAT_CUTOVER.year && month < FORMAT_CUTOVER.month)
  );
}

// Every month tab the rolling window touches (1-3), as "<MesEs> <YY>".
// Derived from the same tz boundaries as the entry filter so the two agree.
// Tabs before the format cutover (old "Partido" column) are excluded.
export function resolveSyncTabs(now: Date): string[] {
  const start = zonedYearMonth(startOfTodayInTimezone(now));
  const end = zonedYearMonth(endOfSyncWindow(now));

  const tabs: string[] = [];
  let { year, month } = start;
  while (year < end.year || (year === end.year && month <= end.month)) {
    if (!isBeforeCutover(year, month)) {
      const monthName = MONTH_NAMES[month - 1];
      const yearSuffix = String(year % 100).padStart(2, "0");
      tabs.push(`${monthName} ${yearSuffix}`);
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return tabs;
}
