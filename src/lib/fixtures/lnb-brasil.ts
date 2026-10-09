import type { FixtureRecord, ParsedFixtures } from "@/lib/fixtures/parse";
import { emptyFixture, htmlText, zonedSchedule } from "@/lib/fixtures/source-helpers";

// lnb.com.br/<liga>/tabela-de-jogos/ (NBB, Liga Ouro) is a server-rendered
// table of the current season, one <tr> per game with the game id in
// `data-real-id`. Dates are Brasília wall-clock; unplayed games show "X".

const BRAZIL_TIMEZONE = "America/Sao_Paulo";
const ROW = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g;

function cell(row: string, pattern: RegExp) {
  return row.match(pattern)?.[1];
}

export function parseLnbBrasilTable(html: string, { competition }: { competition: string }): ParsedFixtures {
  const fixtures: FixtureRecord[] = [];
  const errors: string[] = [];
  let sawTable = false;

  for (const [, row = ""] of html.matchAll(ROW)) {
    const id = cell(row, /data-real-id="(\d+)"/);
    if (!id) {
      continue;
    }
    sawTable = true;

    const when = cell(row, /data-label="DATA"[^>]*>([\s\S]*?)<\/td>/) ?? "";
    const date = when.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!date) {
      errors.push(`Partido ${id} sin fecha.`);
      continue;
    }
    const time = when.match(/(\d{2}):(\d{2})/)?.[0] ?? null;

    const scoreCell = cell(row, /<td class="score_value[^"]*"[^>]*>([\s\S]*?)<\/td>/) ?? "";
    const score = scoreCell.match(/class="home">\s*(\d+)\s*<\/span>[\s\S]*?class="away">\s*(\d+)\s*</);
    const round = htmlText(cell(row, /data-label="RODADA"[^>]*>([\s\S]*?)<\/td>/));

    fixtures.push({
      ...emptyFixture(`lnb-${id}`, competition),
      phase: htmlText(cell(row, /data-label="FASE">([\s\S]*?)<\/td>/)),
      group: round,
      homeTeam: htmlText(cell(row, /data-label="CASA"[\s\S]*?class="team-shortname">([\s\S]*?)<\/span>/)),
      awayTeam: htmlText(cell(row, /data-label="VISITANTE"[\s\S]*?class="team-shortname">([\s\S]*?)<\/span>/)),
      homePoints: score ? Number(score[1]) : null,
      awayPoints: score ? Number(score[2]) : null,
      venue: htmlText(cell(row, /data-label="GIN[^"]*"[^>]*>([^<]*)/)),
      ...zonedSchedule({ date: `${date[3]}-${date[2]}-${date[1]}`, time, timeZone: BRAZIL_TIMEZONE }),
    });
  }

  if (!sawTable) {
    errors.push("No se encontro la tabla de partidos en lnb.com.br.");
  }
  return { fixtures, errors };
}
