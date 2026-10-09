import type { FixtureRecord, ParsedFixtures } from "@/lib/fixtures/parse";
import { fixtureScheduleAt, emptyFixture } from "@/lib/fixtures/source-helpers";

// A Flashscore league page (/basquetbol/<pais>/<liga>/partidos/) embeds its
// upcoming games and recent results as `initialFeeds['fixtures']` and
// `initialFeeds['results']`. Each feed is Flashscore's own text format: records
// start with `~`, fields are `KEY÷value` separated by `¬`. A `ZA` record opens
// a tournament stage; `AA` records are games. The page covers roughly the next
// three months, so the daily sync keeps pulling later rounds into range.
//
// Game fields: AA id, AD kickoff (unix seconds), AE/AF home/away, ER round,
// AB status (1 scheduled, 2 live, 3 finished, anything else postponed or
// cancelled), AG/AH score.

const FEED = /initialFeeds\[['"](fixtures|results)['"]\]\s*=\s*\{\s*data:\s*`([^`]*)`/g;
const STATUS_SCHEDULED = "1";
const STATUS_LIVE = "2";
const STATUS_FINISHED = "3";

function readFields(record: string) {
  const fields = new Map<string, string>();
  for (const part of record.split("¬")) {
    const separator = part.indexOf("÷");
    if (separator > 0) {
      fields.set(part.slice(0, separator), part.slice(separator + 1));
    }
  }
  return fields;
}

function score(value: string | undefined) {
  return value && /^\d+$/.test(value) ? Number(value) : null;
}

function stageLabel(header: string | undefined) {
  // "ESPAÑA: Primera FEB - Play Offs" -> "Play Offs"
  const stage = header?.split(":").slice(1).join(":").split(" - ").slice(1).join(" - ").trim();
  return stage || null;
}

export function parseFlashscoreLeague(html: string, { competition }: { competition: string }): ParsedFixtures {
  const feeds = [...html.matchAll(FEED)];
  if (feeds.length === 0) {
    return { fixtures: [], errors: ["No se encontraron los partidos en la pagina de Flashscore."] };
  }

  const fixtures = new Map<string, FixtureRecord>();
  const errors: string[] = [];

  for (const [, , data = ""] of feeds) {
    let stage: string | null = null;

    for (const record of data.split("~")) {
      const fields = readFields(record);
      if (fields.has("ZA")) {
        stage = stageLabel(fields.get("ZA"));
        continue;
      }

      const id = fields.get("AA");
      if (!id) {
        continue;
      }

      const kickoff = Number(fields.get("AD"));
      if (!Number.isFinite(kickoff) || kickoff <= 0) {
        errors.push(`Partido ${id} sin fecha.`);
        continue;
      }

      const status = fields.get("AB") ?? "";
      const played = status === STATUS_FINISHED || status === STATUS_LIVE;
      fixtures.set(id, {
        ...emptyFixture(`fs-${id}`, competition),
        phase: fields.get("ER")?.trim() || null,
        group: stage,
        homeTeam: fields.get("AE")?.trim() || null,
        awayTeam: fields.get("AF")?.trim() || null,
        suspended: ![STATUS_SCHEDULED, STATUS_LIVE, STATUS_FINISHED].includes(status),
        homePoints: played ? score(fields.get("AG")) : null,
        awayPoints: played ? score(fields.get("AH")) : null,
        ...fixtureScheduleAt(new Date(kickoff * 1000)),
      });
    }
  }

  return { fixtures: [...fixtures.values()], errors };
}
