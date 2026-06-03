import { NextResponse } from "next/server";

import { withApiKey } from "@/lib/api/with-api-key";

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function getPathValue(source: unknown, path: string) {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, source);
}

function normalizeDate(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function normalizeTime(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const matched = trimmed.match(/^(\d{1,2}):(\d{2})/);

  if (matched) {
    return `${matched[1].padStart(2, "0")}:${matched[2]}`;
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(11, 16);
}

function normalizeLookupPayload(payload: unknown, externalId: string) {
  const source =
    (payload &&
      typeof payload === "object" &&
      (((payload as Record<string, unknown>).data as Record<string, unknown>) ||
        ((payload as Record<string, unknown>).match as Record<string, unknown>) ||
        payload)) ||
    {};

  const competition = firstString(
    getPathValue(source, "competition"),
    getPathValue(source, "league"),
    getPathValue(source, "tournament"),
  );

  const homeTeam = firstString(
    getPathValue(source, "home_team"),
    getPathValue(source, "homeTeam"),
    getPathValue(source, "teams.home"),
    getPathValue(source, "home.name"),
  );

  const awayTeam = firstString(
    getPathValue(source, "away_team"),
    getPathValue(source, "awayTeam"),
    getPathValue(source, "teams.away"),
    getPathValue(source, "away.name"),
  );

  const productionCode = firstString(
    getPathValue(source, "production_code"),
    getPathValue(source, "productionCode"),
    getPathValue(source, "event_code"),
    getPathValue(source, "eventCode"),
  );

  const venue = firstString(
    getPathValue(source, "venue"),
    getPathValue(source, "stadium"),
    getPathValue(source, "location.name"),
  );

  const date = normalizeDate(
    firstString(
      getPathValue(source, "date"),
      getPathValue(source, "event_date"),
      getPathValue(source, "kickoff_date"),
      getPathValue(source, "kickoffAt"),
      getPathValue(source, "kickoff_at"),
    ),
  );

  const time = normalizeTime(
    firstString(
      getPathValue(source, "time"),
      getPathValue(source, "event_time"),
      getPathValue(source, "kickoff_time"),
      getPathValue(source, "kickoffAt"),
      getPathValue(source, "kickoff_at"),
    ),
  );

  return {
    externalMatchId: externalId,
    productionCode,
    competition,
    homeTeam,
    awayTeam,
    date,
    time,
    venue,
  };
}

export const POST = withApiKey(async (request) => {
  const { externalId } = (await request.json()) as { externalId?: string };
  const normalizedExternalId = externalId?.trim() ?? "";

  if (!normalizedExternalId) {
    return NextResponse.json(
      { message: "Debes ingresar un ID externo para consultar." },
      { status: 400 },
    );
  }

  const endpoint = process.env.MATCH_LOOKUP_API_URL?.trim();

  if (!endpoint) {
    return NextResponse.json(
      {
        configured: false,
        message:
          "La API de autocompletado todavía no está configurada. Puedes continuar la carga manualmente.",
      },
      { status: 503 },
    );
  }

  try {
    const lookupUrl = new URL(endpoint);
    lookupUrl.searchParams.set("id", normalizedExternalId);

    const response = await fetch(lookupUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(
        {
          message:
            typeof payload?.message === "string"
              ? payload.message
              : "La consulta externa no devolvió un resultado válido.",
        },
        { status: response.status },
      );
    }

    return NextResponse.json({
      configured: true,
      match: normalizeLookupPayload(payload, normalizedExternalId),
    });
  } catch (error) {
    return NextResponse.json(
      {
        configured: false,
        message:
          error instanceof Error
            ? error.message
            : "No fue posible consultar la API externa.",
      },
      { status: 500 },
    );
  }
});
