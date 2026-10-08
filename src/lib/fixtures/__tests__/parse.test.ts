import { describe, expect, it } from "vitest";

import {
  resolveFixtureCompetition,
  resolveGridCompetitionLeague,
  splitCompetitionSeason,
} from "@/lib/fixtures/competitions";
import { fixturePhaseLabel, fixtureTeamLabel } from "@/lib/fixtures/display";
import { decodeCabbCsv, parseCabbCsv } from "@/lib/fixtures/parse";

const HEADER =
  "ID;COMPETICIÓN;CATEGORÍA;FASE;GRUPO;CLUB LOCAL;EQUIPO LOCAL;CLUB VISITANTE;EQUIPO VISITANTE;SUSPENDIDO;PUNTOS LOCAL;PUNTOS VISITANTE;FECHA;HORA;CAMPO DE JUEGO;PISTA;POBLACIÓN CAMPO;PROVINCIA CAMPO;CONTABILIZADO;DESIGNABLE;FACTURAR_CLUB;TRATADO;INFORME;";

// Rows trimmed from the real 08/10/2026 export.
const ROWS = {
  quotedVenue:
    '700190;LIGA ARGENTINA 2026/2027;LA LIGA ARGENTINA;SERIE REGULAR;CONFERENCIA NORTE;BOCHAS SPORT CLUB DE COLONIA CAROYA;BOCHAS (CC);SPORTIVO SUARDI;SP. SUARDI;0;0;0;22/10/2026;21:30;JOSE "PEPE" NOU;;COLONIA CAROYA ;CORDOBA;0;1;1;0;;',
  playedUncounted:
    "696086;LIGA NACIONAL 2026/2027;LA LIGA NACIONAL;SERIE REGULAR;SERIE REGULAR;CLUB ATLETICO BOCA JUNIORS;BOCA;OBERA TENIS CLUB;OBERÁ;0;96;73;07/10/2026;21:05;LUIS CONDE;;C.A.B.A.;CIUDAD AUTONOMA DE BUENOS AIRES;0;1;1;0;;",
  pipes:
    "701459;LIGA FEMENINA 2026/2027;LA LIGA FEMENINA;APERTURA | SERIE REGULAR;CONFERENCIA CENTRO;CLUB REGATAS SAN NICOLAS;REGATAS (SN);CLUB EL TALAR;EL TALAR;0;0;0;19/10/2026;19:00;LA RIBERA;;SAN NICOLAS;BUENOS AIRES;0;1;1;0;;",
  undecided:
    "697166;FORMATIVAS;LA LIGA FEDERAL MINI FEMENINA;QUINTA FASE;FINAL FOUR;LIBRE;- EQUIPO POR DETERMINAR -;LIBRE;- EQUIPO POR DETERMINAR -;0;0;0;11/10/2026;17:00;TEMPLO DEL ROCK;;C.A.B.A.;CIUDAD AUTONOMA DE BUENOS AIRES;0;1;1;0;;",
  suspended:
    "697797;LIGA DE DESARROLLO 2026/2027;LA LIGA PROXIMO;SERIE REGULAR;SERIE REGULAR;CLUB INSTITUTO A.C.C.;INSTITUTO;CLUB ATLETICO FERROCARRIL OESTE;FERRO;1;0;0;10/10/2026;15:30;ANGEL SANDRIN;;CORDOBA;CORDOBA;0;1;1;0;;",
};

function csv(...rows: string[]) {
  return [HEADER, ...rows].join("\r\n") + "\r\n";
}

describe("parseCabbCsv", () => {
  it("keeps raw double quotes in venue names", () => {
    const { fixtures, errors } = parseCabbCsv(csv(ROWS.quotedVenue));

    expect(errors).toEqual([]);
    expect(fixtures).toEqual([
      {
        id: "700190",
        competition: "LIGA ARGENTINA 2026/2027",
        category: "LA LIGA ARGENTINA",
        phase: "SERIE REGULAR",
        group: "CONFERENCIA NORTE",
        homeClub: "BOCHAS SPORT CLUB DE COLONIA CAROYA",
        homeTeam: "BOCHAS (CC)",
        awayClub: "SPORTIVO SUARDI",
        awayTeam: "SP. SUARDI",
        suspended: false,
        homePoints: null,
        awayPoints: null,
        matchDate: "2026-10-22",
        matchTime: "21:30",
        venue: 'JOSE "PEPE" NOU',
        court: null,
        city: "COLONIA CAROYA",
        province: "CORDOBA",
      },
    ]);
  });

  it("stores a real score even when CABB has not counted it yet", () => {
    const [fixture] = parseCabbCsv(csv(ROWS.playedUncounted)).fixtures;

    expect(fixture).toMatchObject({ homePoints: 96, awayPoints: 73 });
  });

  it("treats 0-0 as no score", () => {
    const [fixture] = parseCabbCsv(csv(ROWS.quotedVenue)).fixtures;

    expect(fixture).toMatchObject({ homePoints: null, awayPoints: null });
  });

  it("reads the suspended flag", () => {
    const [fixture] = parseCabbCsv(csv(ROWS.suspended)).fixtures;

    expect(fixture?.suspended).toBe(true);
  });

  it("decodes the latin1 export", () => {
    const bytes = Buffer.from(csv(ROWS.playedUncounted), "latin1");
    const [fixture] = parseCabbCsv(decodeCabbCsv(bytes)).fixtures;

    expect(fixture?.awayTeam).toBe("OBERÁ");
  });

  it("rejects an unexpected header", () => {
    const result = parseCabbCsv("<html>login</html>\n");

    expect(result.fixtures).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  it("skips rows without a numeric id and keeps the rest", () => {
    const result = parseCabbCsv(csv("x;LIGA NACIONAL 2026/2027", ROWS.pipes));

    expect(result.fixtures.map((fixture) => fixture.id)).toEqual(["701459"]);
    expect(result.errors).toHaveLength(1);
  });
});

describe("fixture display", () => {
  it("splits and de-duplicates the phase hierarchy", () => {
    expect(fixturePhaseLabel("APERTURA | SERIE REGULAR", "CONFERENCIA CENTRO")).toBe(
      "Apertura · Serie Regular · Conferencia Centro",
    );
    expect(fixturePhaseLabel("SERIE REGULAR", "SERIE REGULAR")).toBe("Serie Regular");
  });

  it("shows Final Four placeholders as A definir", () => {
    const [fixture] = parseCabbCsv(csv(ROWS.undecided)).fixtures;

    expect(fixtureTeamLabel(fixture?.homeTeam, fixture?.homeClub)).toBe("A definir");
    expect(fixtureTeamLabel("LIBRE")).toBe("A definir");
    expect(fixtureTeamLabel("BOCA")).toBe("BOCA");
  });
});

describe("competitions", () => {
  it("splits the season suffix into the Edición season format", () => {
    expect(splitCompetitionSeason("LIGA NACIONAL 2026/2027")).toEqual({ base: "LIGA NACIONAL", season: "2026/27" });
    expect(splitCompetitionSeason("MAYORES")).toEqual({ base: "MAYORES", season: null });
  });

  it("maps CABB competitions to portal leagues", () => {
    expect(resolveFixtureCompetition("LIGA DE DESARROLLO 2026/2027").leagueSlug).toBe("liga-proximo");
    expect(resolveFixtureCompetition("MAYORES").leagueSlug).toBe("liga-federal");
    expect(resolveFixtureCompetition("ARGENTINO 3X3").leagueSlug).toBe("3x3");
    expect(resolveFixtureCompetition("TOUR 3X3 2025/2026").leagueSlug).toBe("3x3");
    expect(resolveFixtureCompetition("FORMATIVAS").leagueSlug).toBeNull();
  });

  it("maps grid competition text to leagues", () => {
    expect(resolveGridCompetitionLeague("Liga Desarrollo")).toBe("liga-proximo");
    expect(resolveGridCompetitionLeague("Liga Próximo")).toBe("liga-proximo");
    expect(resolveGridCompetitionLeague("Liga Metro")).toBeNull();
  });
});
