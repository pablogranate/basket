import "server-only";

import { appEnv } from "@/lib/env";
import { parseAcbCalendar } from "@/lib/fixtures/acb";
import { downloadCabbPartidos, type CabbAccount } from "@/lib/fixtures/cabb-client";
import { euroleagueSeasonCode, parseEuroleagueGames } from "@/lib/fixtures/euroleague";
import { parseFebambaFixture } from "@/lib/fixtures/febamba";
import { parseFibaEventGames } from "@/lib/fixtures/fiba";
import { parseFlashscoreLeague } from "@/lib/fixtures/flashscore";
import {
  parseFubbPhases,
  readFubbGeniusCompetition,
  readFubbPhases,
  readFubbSiteCompetitions,
} from "@/lib/fixtures/fubb";
import { lbaTeamIds, parseLbaMatches, readLbaCurrentChampionships, readLbaMatches } from "@/lib/fixtures/lba";
import { parseLnbBrasilTable } from "@/lib/fixtures/lnb-brasil";
import { parseCabbCsv, type FixtureRecord, type ParsedFixtures } from "@/lib/fixtures/parse";

// A feed of official games. `key` is stored in fixtures.source: a sync only
// deletes rows of the feeds it fetched completely. Official sites come first;
// Flashscore only covers leagues with no usable official feed.
export type FixtureSource = {
  key: string;
  load: (window: { from: string; to: string }) => Promise<ParsedFixtures>;
};

const REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_PAUSE_MS = 1_500;
// robots.txt crawl delays.
const HOST_PAUSE_MS: Record<string, number> = {
  "www.legabasket.it": 2_000,
};
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";

const ACB_COMPETITIONS = [
  { key: "acb-liga-endesa", competicion: 1, competition: "LIGA ENDESA", isLeague: true },
  { key: "acb-copa-del-rey", competicion: 2, competition: "COPA DEL REY", isLeague: false },
];

const LNB_BRASIL_LEAGUES = [
  { key: "lnb-nbb", path: "nbb", competition: "NBB" },
  { key: "lnb-liga-ouro", path: "liga-ouro", competition: "LIGA OURO" },
];

// FIBA event pages are per edition: add the next edition's slug once FIBA
// publishes it (fiba.basketball/en/events-sitemap_index.xml).
const FIBA_EVENTS = [
  {
    key: "fiba-wcq-americas",
    slug: "fiba-basketball-world-cup-2027-americas-qualifiers",
    competition: "SEL. ARGENTINA",
    teamCode: "ARG",
  },
  { key: "fiba-wbla", slug: "womens-basketball-league-americas-2026", competition: "WBLA" },
];

// FUBB competitions are told apart by their phase names ("Fase Regular LDA
// 2026", "Clasificatorio LUB 25/26").
const FUBB_LEAGUES = [
  { pattern: /\bLUB\b/i, competition: "LUB", idPrefix: "lub" },
  { pattern: /\bLDA\b|ASCENSO/i, competition: "LIGA DE ASCENSO", idPrefix: "lda" },
];

// FeBAMBA tournament and category of the Liga Metropolitana; both change each
// season (febamba.com/detalle-torneo links).
const FEBAMBA_METROPOLITANA = { competicionId: 2310, compCatId: 6290 };

const FLASHSCORE_LEAGUES = [
  { key: "fs-primera-feb", path: "espana/primera-feb", competition: "PRIMERA FEB" },
  { key: "fs-super-8", path: "brasil/super-8", competition: "COPA SUPER 8" },
  { key: "fs-lnb-chile", path: "chile/lnb", competition: "LNB CHILE" },
  { key: "fs-liga-dos", path: "chile/lnb-2", competition: "LIGA DOS" },
];

const lastRequestAt = new Map<string, number>();

async function request(url: string, init: RequestInit = {}) {
  const host = new URL(url).host;
  const wait = (lastRequestAt.get(host) ?? 0) + (HOST_PAUSE_MS[host] ?? DEFAULT_PAUSE_MS) - Date.now();
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestAt.set(host, Date.now());

  const response = await fetch(url, {
    ...init,
    headers: { "user-agent": USER_AGENT, "accept-language": "es-AR,es;q=0.9", ...init.headers },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok && !(init.redirect === "manual" && response.status >= 300 && response.status < 400)) {
    await response.body?.cancel();
    throw new Error(`HTTP ${response.status} en ${url}`);
  }
  return response;
}

async function fetchText(url: string, init?: RequestInit) {
  return (await request(url, init)).text();
}

async function fetchJson(url: string) {
  return (await request(url, { headers: { accept: "application/json" } })).json() as Promise<unknown>;
}

function merge(results: ParsedFixtures[]): ParsedFixtures {
  return { fixtures: results.flatMap((result) => result.fixtures), errors: results.flatMap((result) => result.errors) };
}

function cabbSource(account: CabbAccount): FixtureSource {
  return {
    key: `cabb-${account.key.toLowerCase()}`,
    load: async ({ from, to }) => parseCabbCsv(await downloadCabbPartidos({ account, from, to })),
  };
}

const euroleagueSource: FixtureSource = {
  key: "euroleague",
  load: async ({ from, to }) => {
    const seasons = [...new Set([euroleagueSeasonCode(from), euroleagueSeasonCode(to)])];
    const results: ParsedFixtures[] = [];
    for (const season of seasons) {
      const body = await fetchJson(`https://api-live.euroleague.net/v2/competitions/E/seasons/${season}/games`);
      results.push(parseEuroleagueGames(body, { competition: "EUROLIGA" }));
    }
    return merge(results);
  },
};

// One round lists every team; each team's season then covers the whole
// championship (about 17 requests at the 2-second crawl delay).
const lbaSource: FixtureSource = {
  key: "lba",
  load: async () => {
    const base = "https://www.legabasket.it/api/championships/get-championships-calendar-by-id";
    const championships = readLbaCurrentChampionships(await fetchText("https://www.legabasket.it/calendario"));
    if (championships.length === 0) {
      return { fixtures: [], errors: ["No se encontro el campeonato actual en legabasket.it."] };
    }

    const results: ParsedFixtures[] = [];
    for (const championship of championships) {
      const current = readLbaMatches(await fetchJson(`${base}?id=${championship}`));
      if (!current) {
        results.push({ fixtures: [], errors: [`legabasket.it: campeonato ${championship} sin partidos.`] });
        continue;
      }
      const matches = new Map(current.map((match) => [match.id, match]));
      for (const team of lbaTeamIds(current)) {
        (readLbaMatches(await fetchJson(`${base}?id=${championship}&t_id=${team}`)) ?? []).forEach((match) =>
          matches.set(match.id, match),
        );
      }
      results.push(parseLbaMatches([...matches.values()], { competition: "LBA" }));
    }
    return merge(results);
  },
};

// /set-competition stores the choice in the session cookie that /calendario
// then reads.
async function fubbGeniusCompetition(siteId: string) {
  const choice = await request(`https://www.fubb.org.uy/set-competition?competition=${siteId}`, { redirect: "manual" });
  await choice.body?.cancel();
  const cookie = choice.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  return readFubbGeniusCompetition(await fetchText("https://www.fubb.org.uy/calendario", { headers: { cookie } }));
}

const fubbSource: FixtureSource = {
  key: "fubb",
  load: async () => {
    const siteIds = readFubbSiteCompetitions(await fetchText("https://www.fubb.org.uy/"));
    const fixtures: FixtureRecord[] = [];
    const errors: string[] = [];

    for (const siteId of siteIds) {
      const competitionId = await fubbGeniusCompetition(siteId);
      if (!competitionId) {
        errors.push(`fubb.org.uy: competencia ${siteId} sin calendario.`);
        continue;
      }
      const phases = readFubbPhases(
        await fetchJson(`https://gapi.pixeles.club/ligas/fubb/api/bq/matchesnew?competitionId=${competitionId}`),
      );
      if (!phases) {
        errors.push(`fubb.org.uy: competencia ${competitionId} cambio de formato.`);
        continue;
      }
      const names = phases.map((phase) => phase.name ?? "").join(" ");
      const league = FUBB_LEAGUES.find(({ pattern }) => pattern.test(names));
      if (league) {
        const parsed = parseFubbPhases(phases, league);
        fixtures.push(...parsed.fixtures);
        errors.push(...parsed.errors);
      }
    }

    return { fixtures, errors };
  },
};

const febambaSource: FixtureSource = {
  key: "febamba-metropolitana",
  load: async ({ from, to }) => {
    const params = new URLSearchParams({
      handler: "CargarSubPagina",
      competicionId: String(FEBAMBA_METROPOLITANA.competicionId),
      compCatId: String(FEBAMBA_METROPOLITANA.compCatId),
      fechaIni: from,
      fechaFin: to,
      faseId: "0",
      grupoId: "0",
      seccion: "fixture",
    });
    return parseFebambaFixture(await fetchText(`https://www.febamba.com/detalle-torneo?${params}`), {
      competition: "LIGA METROPOLITANA",
    });
  },
};

export function defaultFixtureSources(): FixtureSource[] {
  return [
    ...appEnv.cabbAccounts.map(cabbSource),
    ...ACB_COMPETITIONS.map(({ key, competicion, competition, isLeague }) => ({
      key,
      load: async () =>
        parseAcbCalendar(await fetchText(`https://acb.com/es/liga/calendario?competicion=${competicion}`), {
          competition,
          isLeague,
        }),
    })),
    euroleagueSource,
    lbaSource,
    ...LNB_BRASIL_LEAGUES.map(({ key, path, competition }) => ({
      key,
      load: async () =>
        parseLnbBrasilTable(await fetchText(`https://lnb.com.br/${path}/tabela-de-jogos/`), { competition }),
    })),
    fubbSource,
    ...FIBA_EVENTS.map(({ key, slug, competition, teamCode }) => ({
      key,
      load: async () =>
        parseFibaEventGames(await fetchText(`https://www.fiba.basketball/en/events/${slug}/games`), {
          competition,
          teamCode,
        }),
    })),
    febambaSource,
    ...FLASHSCORE_LEAGUES.map(({ key, path, competition }) => ({
      key,
      load: async () =>
        parseFlashscoreLeague(await fetchText(`https://www.flashscore.com.ar/basquetbol/${path}/partidos/`), {
          competition,
        }),
    })),
  ];
}
