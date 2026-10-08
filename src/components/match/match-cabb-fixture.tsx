import { CircleAlert, Trophy } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";

import type { UserContext } from "@/lib/auth";
import { getFixtureForMatch } from "@/lib/data/fixtures";
import { resolveFixtureCompetition } from "@/lib/fixtures/competitions";
import {
  fixturePhaseLabel,
  fixtureTeamLabel,
  hasFixtureScore,
  titleCaseFixtureText,
} from "@/lib/fixtures/display";
import { FIXTURE_TIMEZONE } from "@/lib/fixtures/link-plan";

function formatFixtureDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

export async function MatchCabbFixture({
  user,
  fixtureId,
  kickoffAt,
}: {
  user: UserContext;
  fixtureId: string;
  kickoffAt: string;
}) {
  const fixture = await getFixtureForMatch(user, fixtureId);

  if (!fixture) {
    return null;
  }

  const gridDate = formatInTimeZone(kickoffAt, FIXTURE_TIMEZONE, "yyyy-MM-dd");
  const gridTime = formatInTimeZone(kickoffAt, FIXTURE_TIMEZONE, "HH:mm");
  const scheduleDiffers =
    (fixture.matchDate !== null && fixture.matchDate !== gridDate) ||
    (fixture.matchTime !== null && fixture.matchTime !== gridTime);
  const phase = fixturePhaseLabel(fixture.phase, fixture.group);
  const place = [fixture.venue, fixture.city, fixture.province]
    .filter(Boolean)
    .map(titleCaseFixtureText)
    .join(", ");

  return (
    <section className="panel-surface space-y-3 border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <Trophy className="size-4 text-[var(--accent)]" />
          Partido CABB · {resolveFixtureCompetition(fixture.competition).label}
          {phase ? <span className="font-normal text-[var(--muted)]">· {phase}</span> : null}
        </h2>
        <span className="font-mono text-xs text-[var(--muted)]">
          #{fixture.id} · actualizado {formatInTimeZone(fixture.syncedAt, FIXTURE_TIMEZONE, "dd/MM HH:mm")}
        </span>
      </div>

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-[var(--muted)]">Horario oficial</dt>
        <dd className="font-medium text-[var(--foreground)]">
          {fixture.matchDate ? formatFixtureDate(fixture.matchDate) : "Sin fecha"}{" "}
          {fixture.matchTime ?? ""} (hora argentina)
        </dd>
        <dt className="text-[var(--muted)]">Sede</dt>
        <dd className="text-[var(--foreground)]">{place || "Sin definir"}</dd>
        <dt className="text-[var(--muted)]">Resultado</dt>
        <dd className="text-[var(--foreground)]">
          {fixture.suspended
            ? "Suspendido"
            : hasFixtureScore(fixture)
              ? `${fixtureTeamLabel(fixture.homeTeam)} ${fixture.homePoints} – ${fixture.awayPoints} ${fixtureTeamLabel(fixture.awayTeam)}`
              : "Sin jugar"}
        </dd>
      </dl>

      {scheduleDiffers ? (
        <p className="flex items-start gap-2 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent)]">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          La grilla tiene {formatFixtureDate(gridDate)} {gridTime} (hora argentina) y la CABB{" "}
          {fixture.matchDate ? formatFixtureDate(fixture.matchDate) : "sin fecha"} {fixture.matchTime ?? ""}.
        </p>
      ) : null}
    </section>
  );
}
