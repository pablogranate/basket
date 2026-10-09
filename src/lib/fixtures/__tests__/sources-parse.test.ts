import { describe, expect, it } from "vitest";

import { parseAcbCalendar } from "@/lib/fixtures/acb";
import { euroleagueSeasonCode, parseEuroleagueGames } from "@/lib/fixtures/euroleague";
import { parseFebambaFixture } from "@/lib/fixtures/febamba";
import { parseFibaEventGames } from "@/lib/fixtures/fiba";
import { parseFlashscoreLeague } from "@/lib/fixtures/flashscore";
import { parseFubbPhases, readFubbGeniusCompetition, readFubbSiteCompetitions } from "@/lib/fixtures/fubb";
import { lbaTeamIds, parseLbaMatches, readLbaCurrentChampionships } from "@/lib/fixtures/lba";
import { parseLnbBrasilTable } from "@/lib/fixtures/lnb-brasil";

function acbPage(rounds: unknown[]) {
  const payload = `30:["$","div",null,{"props":{"data":{"teams":[{"id":1,"fullName":"Surne Bilbao"},{"id":2,"fullName":"Barça"}],"rounds":${JSON.stringify(rounds)}}}}]`;
  return `<script>self.__next_f.push([1,${JSON.stringify(payload)}])</script>`;
}

function acbMatch(overrides: Record<string, unknown>) {
  return {
    id: 105375,
    homeTeam: "$30:props:data:teams:0",
    awayTeam: "$30:props:data:teams:1",
    homeTeamScore: 0,
    awayTeamScore: 0,
    startDateTime: "2026-10-11T16:00:00Z",
    matchStatus: "NOT_STARTED",
    seasonStartYear: 2026,
    ...overrides,
  };
}

describe("parseAcbCalendar", () => {
  it("resolves team references and converts kickoff to Argentine time", () => {
    const parsed = parseAcbCalendar(acbPage([{ roundNumber: 3, matches: [acbMatch({})] }]), {
      competition: "LIGA ENDESA",
      isLeague: true,
    });

    expect(parsed.errors).toEqual([]);
    expect(parsed.fixtures).toEqual([
      expect.objectContaining({
        id: "acb-105375",
        competition: "LIGA ENDESA 2026/2027",
        phase: "Jornada 3",
        homeTeam: "Surne Bilbao",
        awayTeam: "Barça",
        homePoints: null,
        matchDate: "2026-10-11",
        matchTime: "13:00",
        suspended: false,
      }),
    ]);
  });

  it("keeps scores of finished games, flags postponed ones and skips unscheduled ones", () => {
    const parsed = parseAcbCalendar(
      acbPage([
        {
          roundNumber: 1,
          matches: [
            acbMatch({ id: 1, matchStatus: "FINALIZED", homeTeamScore: 107, awayTeamScore: 92 }),
            acbMatch({ id: 2, matchStatus: "POSTPONED" }),
            acbMatch({ id: 3, matchStatus: "UNSCHEDULED" }),
          ],
        },
      ]),
      { competition: "LIGA ENDESA", isLeague: true },
    );

    expect(parsed.fixtures.map((fixture) => [fixture.id, fixture.homePoints, fixture.suspended])).toEqual([
      ["acb-1", 107, false],
      ["acb-2", null, true],
    ]);
  });

  it("names knockout rounds by their size", () => {
    const parsed = parseAcbCalendar(
      acbPage([{ roundNumber: 3, matches: [acbMatch({})] }]),
      { competition: "COPA DEL REY", isLeague: false },
    );

    expect(parsed.fixtures[0]?.phase).toBe("Final");
  });

  it("reports a page without a calendar", () => {
    expect(parseAcbCalendar("<html></html>", { competition: "LIGA ENDESA", isLeague: true })).toEqual({
      fixtures: [],
      errors: [expect.stringContaining("acb.com")],
    });
  });
});

const FLASHSCORE_PAGE = `
<script>
  cjs.initialFeeds['fixtures'] = {
    data: \`SA÷3¬~ZA÷ESPAÑA: Primera FEB¬ZEE÷IsRBNS56¬~AA÷QXmOwIhK¬AD÷1791572400¬AB÷1¬ER÷Jornada 3¬AE÷Palencia¬AF÷Menorca¬~AA÷zzPost01¬AD÷1791658800¬AB÷5¬ER÷Jornada 4¬AE÷Oviedo¬AF÷Gipuzkoa¬\`,
  };
  cjs.initialFeeds['results'] = {
    data: \`SA÷3¬~ZA÷ESPAÑA: Primera FEB - Play Offs¬~AA÷fXVwbtuS¬AD÷1791129600¬AB÷3¬ER÷Cuartos¬AE÷Gipuzkoa¬AF÷C. Ourense Baloncesto¬AG÷86¬AH÷90¬\`,
  };
</script>`;

describe("parseFlashscoreLeague", () => {
  it("reads upcoming games and results from both feeds", () => {
    const parsed = parseFlashscoreLeague(FLASHSCORE_PAGE, { competition: "PRIMERA FEB" });

    expect(parsed.errors).toEqual([]);
    expect(parsed.fixtures).toEqual([
      expect.objectContaining({
        id: "fs-QXmOwIhK",
        competition: "PRIMERA FEB",
        phase: "Jornada 3",
        group: null,
        homeTeam: "Palencia",
        awayTeam: "Menorca",
        matchDate: "2026-10-09",
        matchTime: "16:00",
        homePoints: null,
        suspended: false,
      }),
      expect.objectContaining({ id: "fs-zzPost01", suspended: true }),
      expect.objectContaining({
        id: "fs-fXVwbtuS",
        group: "Play Offs",
        homePoints: 86,
        awayPoints: 90,
        matchDate: "2026-10-04",
      }),
    ]);
  });

  it("reports a page without feeds", () => {
    expect(parseFlashscoreLeague("<html></html>", { competition: "PRIMERA FEB" })).toEqual({
      fixtures: [],
      errors: [expect.stringContaining("Flashscore")],
    });
  });
});

describe("parseEuroleagueGames", () => {
  const game = {
    identifier: "E2026_40",
    utcDate: "2026-10-09T18:15:00Z",
    localDate: "2026-10-09T21:15:00",
    confirmedHour: true,
    played: false,
    roundName: "Round 4",
    phaseType: { name: "Regular Season" },
    local: { club: { name: "Olympiacos Piraeus" }, score: 0 },
    road: { club: { name: "Anadolu Efes Istanbul" }, score: 0 },
  };

  it("converts kickoff and keeps scores of played games only", () => {
    const parsed = parseEuroleagueGames(
      { data: [game, { ...game, identifier: "E2026_1", played: true, local: { club: { name: "A" }, score: 80 }, road: { club: { name: "B" }, score: 70 } }] },
      { competition: "EUROLIGA" },
    );

    expect(parsed.fixtures).toEqual([
      expect.objectContaining({ id: "el-E2026_40", matchDate: "2026-10-09", matchTime: "15:15", homePoints: null, phase: "Round 4" }),
      expect.objectContaining({ id: "el-E2026_1", homePoints: 80, awayPoints: 70 }),
    ]);
  });

  it("keeps only the local date of unconfirmed kickoffs", () => {
    const parsed = parseEuroleagueGames(
      { data: [{ ...game, confirmedHour: false, localDate: "2027-04-16T00:00:00" }] },
      { competition: "EUROLIGA" },
    );

    expect(parsed.fixtures[0]).toMatchObject({ matchDate: "2027-04-16", matchTime: null });
  });

  it("names the season by its starting year", () => {
    expect(euroleagueSeasonCode("2026-10-09")).toBe("E2026");
    expect(euroleagueSeasonCode("2027-03-01")).toBe("E2026");
  });
});

describe("LBA", () => {
  const match = {
    id: 25383,
    game_status: "0",
    match_datetime: "2026-10-10T20:00:00.000+02:00",
    h_team_id: 1,
    h_team_name: "APU Old Wild West Udine",
    v_team_id: 2,
    v_team_name: "Dolomiti Energia Trentino",
    home_final_score: 0,
    visitor_final_score: 0,
    day_name: "3° Giornata",
    plant_name: "PalaCarnera",
    town_name: "Udine",
  };

  it("converts Italian kickoffs and leaves unset times empty", () => {
    const parsed = parseLbaMatches(
      [match, { ...match, id: 2, match_datetime: "2027-05-09T00:00:00.000+02:00" }],
      { competition: "LBA" },
    );

    expect(parsed.fixtures).toEqual([
      expect.objectContaining({ id: "lba-25383", matchDate: "2026-10-10", matchTime: "15:00", venue: "PalaCarnera" }),
      expect.objectContaining({ id: "lba-2", matchDate: "2027-05-09", matchTime: null }),
    ]);
    expect(lbaTeamIds([match])).toEqual([1, 2]);
  });

  it("reads the latest season's championships from the calendar page", () => {
    const data = { props: { pageProps: { allCompetitionsBySeriesId: { competitions: [
      { id: 595, year: 2025, ctype_code: "PO" },
      { id: 602, year: 2026, ctype_code: "RS" },
    ] } } } };
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;

    expect(readLbaCurrentChampionships(html)).toEqual([602]);
  });
});

describe("parseLnbBrasilTable", () => {
  const row = (score: string) => `<tr><td data-label="JOGO" data-real-id="27110">1</td>
    <td class="date_value" data-label="DATA"><span>17/10/2026</span> <span>16:00</span></td>
    <td class="home_team_value" data-label="CASA"><span class="team-shortname">Mogi Basquete</span></td>
    <td class="score_value show-for-medium">${score}</td>
    <td class="visitor_team_value" data-label="VISITANTE"><span class="team-shortname">Corinthians</span></td>
    <td class="game_value" data-label="RODADA"><span class="number">1ª</span> <span>RODADA</span></td>
    <td class="stage_value" data-label="FASE">1º TURNO</td>
    <td class="gym_value" data-label="GINÁSIO">Prof. Hugo Ramos <div></div></td></tr>`;

  it("reads Brasília kickoffs, round and venue", () => {
    expect(parseLnbBrasilTable(row(" X "), { competition: "NBB" }).fixtures).toEqual([
      expect.objectContaining({
        id: "lnb-27110",
        homeTeam: "Mogi Basquete",
        awayTeam: "Corinthians",
        phase: "1º TURNO",
        group: "1ª RODADA",
        venue: "Prof. Hugo Ramos",
        matchDate: "2026-10-17",
        matchTime: "16:00",
        homePoints: null,
      }),
    ]);
  });

  it("reads the score of played games", () => {
    const parsed = parseLnbBrasilTable(row('<a><span class="home">94</span> X <span class="away">92</span></a>'), { competition: "NBB" });

    expect(parsed.fixtures[0]).toMatchObject({ homePoints: 94, awayPoints: 92 });
  });
});

describe("FUBB", () => {
  it("reads site and Genius competition ids", () => {
    expect(readFubbSiteCompetitions('<a href="/set-competition?competition=264">x</a><a href="/set-competition?competition=264">')).toEqual(["264"]);
    expect(readFubbGeniusCompetition('<games-calendar league-slug="fubb" competition-id="42104">')).toBe("42104");
  });

  it("parses phases with UTC kickoffs", () => {
    const parsed = parseFubbPhases(
      [{ name: "Clasificatorio LUB 25/26", matches: [{
        matchId: 2741411,
        matchStatus: "COMPLETE",
        matchTimeUTC: "2025-10-09 23:30:00",
        competitors: [{ competitorName: "HEBRAICA Y MACABI", scoreString: "84" }, { competitorName: "UNION ATLETICA", scoreString: "81" }],
        venue: { venueName: "Larre Borges" },
      }] }],
      { competition: "LUB", idPrefix: "lub" },
    );

    expect(parsed.fixtures).toEqual([
      expect.objectContaining({ id: "lub-2741411", phase: "Clasificatorio LUB 25/26", matchDate: "2025-10-09", matchTime: "20:30", homePoints: 84, awayPoints: 81 }),
    ]);
  });
});

describe("parseFibaEventGames", () => {
  const page = (games: unknown[]) => {
    const payload = `5:["$","div",null,{"games":${JSON.stringify(games)}}]`;
    return `<script>self.__next_f.push([1,${JSON.stringify(payload)}])</script>`;
  };
  const game = {
    gameId: 127280,
    statusCode: "INIT",
    gameDateTime: "2026-11-26T00:00:00",
    gameDateTimeUTC: "2026-11-26T00:00:00",
    hasTimeGameDateTime: false,
    teamA: { code: "ARG", officialName: "Argentina" },
    teamB: { code: "BAH", officialName: "Bahamas" },
    windowName: "Window 5",
    round: { roundName: "2nd Round" },
    groupPairingCode: "F",
  };

  it("keeps one team's games and the local date when the time is unset", () => {
    const parsed = parseFibaEventGames(
      page([game, { ...game, gameId: 1, teamA: { code: "CAN" }, teamB: { code: "BAH" } }]),
      { competition: "SEL. ARGENTINA", teamCode: "ARG" },
    );

    expect(parsed.fixtures).toEqual([
      expect.objectContaining({ id: "fiba-127280", homeTeam: "Argentina", awayTeam: "Bahamas", matchDate: "2026-11-26", matchTime: null, phase: "Window 5 | 2nd Round", group: "Grupo F" }),
    ]);
  });
});

describe("parseFebambaFixture", () => {
  const row = (score: [number, number]) => `<tr class="fila-tabla-calendarios datos-estadisticos">
    <td><div class="escudo"><img src="/escudos/49/112692" /></div></td>
    <td><strong class="nombre-equipo">CLUB GIMNASIA y ESGRIMA DE ITUZAINGO </strong></td>
    <td class="resultados"><strong>${score[0]}</strong></td>
    <td class="resultados"><strong>${score[1]}</strong></td>
    <td><strong class="nombre-equipo">CLUB DEPORTIVO DEFENSORES DE HURLINGHAM</strong></td>
    <td><div class="escudo"><img src="/escudos/36/112792" /></div></td>
    <td class="fecha-campo text-start"><strong>09/10/2026 20:15</strong> <small>G.e. Ituzaingo</small></td></tr>`;

  it("builds the id from date and crests and reads 0-0 as unplayed", () => {
    expect(parseFebambaFixture(row([0, 0]), { competition: "LIGA METROPOLITANA" }).fixtures).toEqual([
      expect.objectContaining({
        id: "febamba-2026-10-09-112692-112792",
        homeTeam: "CLUB GIMNASIA y ESGRIMA DE ITUZAINGO",
        awayTeam: "CLUB DEPORTIVO DEFENSORES DE HURLINGHAM",
        matchDate: "2026-10-09",
        matchTime: "20:15",
        venue: "G.e. Ituzaingo",
        homePoints: null,
      }),
    ]);
    expect(parseFebambaFixture(row([107, 64]), { competition: "LIGA METROPOLITANA" }).fixtures[0]).toMatchObject({
      homePoints: 107,
      awayPoints: 64,
    });
  });
});
