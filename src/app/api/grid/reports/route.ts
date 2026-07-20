import { NextResponse } from "next/server";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";

import { withAuth } from "@/lib/api/with-auth";
import { FULL_DASHBOARD_ACCESS_ROLES } from "@/lib/constants";
import { getDayRange } from "@/lib/date";
import { db } from "@/lib/db/client";
import {
  assignments as assignmentsTable,
  matches as matchesTable,
  people as peopleTable,
  roles as rolesTable,
} from "@/lib/db/schema";
import type { ReportMatchRow } from "@/lib/grid/report-stats";
import { ensureErrorMessage } from "@/lib/utils";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const paramsSchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
    timezone: z.string().min(1),
  })
  .refine((value) => value.from <= value.to, {
    message: "El rango es inválido: desde debe ser anterior a hasta.",
  });

type MatchQueryRow = {
  id: string;
  kickoff_at: string;
  competition: string | null;
  home_team: string;
  away_team: string;
  production_mode: string | null;
  assignments: Array<{
    person_id: string | null;
    role: { name: string; category: string; sort_order: number } | null;
    person: { id: string; full_name: string } | null;
  }> | null;
};

export const GET = withAuth(
  { roles: FULL_DASHBOARD_ACCESS_ROLES },
  async (request) => {
    const url = new URL(request.url);
    const parsed = paramsSchema.safeParse({
      from: url.searchParams.get("from") ?? "",
      to: url.searchParams.get("to") ?? "",
      timezone: url.searchParams.get("timezone") ?? "",
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Rango de fechas inválido." },
        { status: 400 },
      );
    }

    const { from, to, timezone } = parsed.data;
    const startUtc = getDayRange(from, timezone).startUtc;
    const endUtc = getDayRange(to, timezone).endUtc;

    try {
      const matchRows = await db
        .select({
          id: matchesTable.id,
          kickoff_at: matchesTable.kickoffAt,
          competition: matchesTable.competition,
          home_team: matchesTable.homeTeam,
          away_team: matchesTable.awayTeam,
          production_mode: matchesTable.productionMode,
        })
        .from(matchesTable)
        .where(
          and(
            gte(matchesTable.kickoffAt, startUtc),
            lte(matchesTable.kickoffAt, endUtc),
          ),
        );

      const matchIds = matchRows.map((row) => row.id);

      const assignmentRows = matchIds.length
        ? await db
            .select({
              match_id: assignmentsTable.matchId,
              person_id: assignmentsTable.personId,
              role: {
                name: rolesTable.name,
                category: rolesTable.category,
                sort_order: rolesTable.sortOrder,
              },
              person: {
                id: peopleTable.id,
                full_name: peopleTable.fullName,
              },
            })
            .from(assignmentsTable)
            .innerJoin(rolesTable, eq(assignmentsTable.roleId, rolesTable.id))
            .leftJoin(peopleTable, eq(assignmentsTable.personId, peopleTable.id))
            .where(inArray(assignmentsTable.matchId, matchIds))
            .orderBy(asc(assignmentsTable.id))
        : [];

      const assignmentsByMatch = new Map<string, MatchQueryRow["assignments"]>();
      for (const row of assignmentRows) {
        const bucket = assignmentsByMatch.get(row.match_id) ?? [];
        bucket!.push({
          person_id: row.person_id,
          role: row.role,
          person: row.person?.id ? row.person : null,
        });
        assignmentsByMatch.set(row.match_id, bucket);
      }

      const matches: ReportMatchRow[] = matchRows.map((row) => ({
        id: row.id,
        kickoffAt: row.kickoff_at,
        competition: row.competition,
        homeTeam: row.home_team,
        awayTeam: row.away_team,
        productionMode: row.production_mode,
        assignments: (assignmentsByMatch.get(row.id) ?? [])
          .filter((slot) => slot.role)
          .map((slot) => ({
            personId: slot.person?.id ?? slot.person_id,
            personName: slot.person?.full_name ?? null,
            roleName: slot.role?.name ?? "",
            roleCategory: slot.role?.category ?? "",
            roleSortOrder: slot.role?.sort_order ?? 0,
          })),
      }));

      return NextResponse.json({ matches });
    } catch (caught) {
      console.error("[grid-reports] failed to load matches", caught);
      return NextResponse.json(
        { error: ensureErrorMessage(caught) },
        { status: 500 },
      );
    }
  },
);
