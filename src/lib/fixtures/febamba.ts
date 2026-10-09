import type { FixtureRecord, ParsedFixtures } from "@/lib/fixtures/parse";
import { emptyFixture, htmlText } from "@/lib/fixtures/source-helpers";

// febamba.com (Indalweb, like Gesdeportiva) renders a tournament's fixture as
// an HTML fragment from /detalle-torneo?handler=CargarSubPagina&seccion=fixture
// with a date range. Rows have no game id, round or status: the id is built
// from the date and both crest ids, so a rescheduled game becomes a new row.
// Dates are Buenos Aires wall-clock; unplayed games show 0-0.

const ROW = /<tr class="fila-tabla-calendarios[^"]*">([\s\S]*?)<\/tr>/g;

export function parseFebambaFixture(html: string, { competition }: { competition: string }): ParsedFixtures {
  const fixtures: FixtureRecord[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const [, row = ""] of html.matchAll(ROW)) {
    const teams = [...row.matchAll(/<strong class="nombre-equipo">([\s\S]*?)<\/strong>/g)].map(([, name]) => htmlText(name));
    const crests = [...row.matchAll(/\/escudos\/\d+\/(\d+)/g)].map(([, id]) => id);
    const scores = [...row.matchAll(/<td class="resultados"><strong>(\d+)<\/strong><\/td>/g)].map(([, value]) => Number(value));
    const when = row.match(/class="fecha-campo[^"]*">\s*<strong>(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}))?/);

    if (!when) {
      errors.push(`Partido sin fecha: ${teams.join(" vs ")}`);
      continue;
    }

    const date = `${when[3]}-${when[2]}-${when[1]}`;
    const id = `febamba-${date}-${crests[0] ?? teams[0]}-${crests[1] ?? teams[1]}`;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);

    const [homePoints = 0, awayPoints = 0] = scores;
    const hasScore = homePoints > 0 || awayPoints > 0;
    fixtures.push({
      ...emptyFixture(id, competition),
      homeTeam: teams[0] ?? null,
      awayTeam: teams[1] ?? null,
      homePoints: hasScore ? homePoints : null,
      awayPoints: hasScore ? awayPoints : null,
      venue: htmlText(row.match(/<small>([\s\S]*?)<\/small>/)?.[1]),
      matchDate: date,
      matchTime: when[4] ?? null,
    });
  }

  return { fixtures, errors };
}
