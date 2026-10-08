import { parse } from "csv-parse/sync";

export type FixtureRecord = {
  id: string;
  competition: string | null;
  category: string | null;
  phase: string | null;
  group: string | null;
  homeClub: string | null;
  homeTeam: string | null;
  awayClub: string | null;
  awayTeam: string | null;
  suspended: boolean;
  homePoints: number | null;
  awayPoints: number | null;
  matchDate: string | null;
  matchTime: string | null;
  venue: string | null;
  court: string | null;
  city: string | null;
  province: string | null;
};

export type ParsedFixtures = {
  fixtures: FixtureRecord[];
  errors: string[];
};

// Column order of the Gesdeportiva "partidos" export (24 fields with the
// trailing `;`). DESIGNABLE, FACTURAR_CLUB, TRATADO and INFORME are ignored.
const EXPECTED_HEADER = [
  "ID",
  "COMPETICION",
  "CATEGORIA",
  "FASE",
  "GRUPO",
  "CLUB LOCAL",
  "EQUIPO LOCAL",
  "CLUB VISITANTE",
  "EQUIPO VISITANTE",
  "SUSPENDIDO",
  "PUNTOS LOCAL",
  "PUNTOS VISITANTE",
  "FECHA",
  "HORA",
  "CAMPO DE JUEGO",
  "PISTA",
  "POBLACION CAMPO",
  "PROVINCIA CAMPO",
];

function stripAccents(value: string) {
  return value.normalize("NFD").replaceAll(/[̀-ͯ]/g, "");
}

function text(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function points(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

function isoDate(value: string | undefined) {
  const match = (value ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function time(value: string | undefined) {
  const match = (value ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1]!.padStart(2, "0")}:${match[2]}` : null;
}

// The export is ISO-8859-1. Venue names carry raw double quotes
// (`JOSE "PEPE" NOU`), so quote handling must stay off.
export function decodeCabbCsv(bytes: Uint8Array) {
  return new TextDecoder("latin1").decode(bytes);
}

export function parseCabbCsv(csv: string): ParsedFixtures {
  const rows: string[][] = parse(csv, {
    delimiter: ";",
    quote: false,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  const [header, ...body] = rows;
  if (!header) {
    return { fixtures: [], errors: [] };
  }

  const normalizedHeader = header.slice(0, EXPECTED_HEADER.length).map((cell) => stripAccents(cell).toUpperCase());
  if (normalizedHeader.join(";") !== EXPECTED_HEADER.join(";")) {
    return { fixtures: [], errors: [`Encabezado inesperado: ${header.join(";")}`] };
  }

  const fixtures: FixtureRecord[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  body.forEach((row, index) => {
    const id = text(row[0]);
    if (!id || !/^\d+$/.test(id)) {
      errors.push(`Fila ${index + 2}: ID invalido (${row[0] ?? ""}).`);
      return;
    }
    if (seen.has(id)) {
      return;
    }
    seen.add(id);

    const homePoints = points(row[10]);
    const awayPoints = points(row[11]);
    // CABB writes 0-0 for unplayed games; a real score can exist even with
    // CONTABILIZADO=0, so the 0-0 pair is the only "no score" signal.
    const hasScore = homePoints !== null && awayPoints !== null && (homePoints > 0 || awayPoints > 0);

    fixtures.push({
      id,
      competition: text(row[1]),
      category: text(row[2]),
      phase: text(row[3]),
      group: text(row[4]),
      homeClub: text(row[5]),
      homeTeam: text(row[6]),
      awayClub: text(row[7]),
      awayTeam: text(row[8]),
      suspended: (row[9] ?? "").trim() === "1",
      homePoints: hasScore ? homePoints : null,
      awayPoints: hasScore ? awayPoints : null,
      matchDate: isoDate(row[12]),
      matchTime: time(row[13]),
      venue: text(row[14]),
      court: text(row[15]),
      city: text(row[16]),
      province: text(row[17]),
    });
  });

  return { fixtures, errors };
}
