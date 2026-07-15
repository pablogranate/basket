import { NextResponse } from "next/server";
import { z } from "zod";

import { withAuth } from "@/lib/api/with-auth";
import { FULL_DASHBOARD_ACCESS_ROLES } from "@/lib/constants";
import { getDayRange } from "@/lib/date";
import type { ReportMatchRow } from "@/lib/grid/report-stats";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("matches")
        .select(
          "id, kickoff_at, competition, home_team, away_team, production_mode, assignments(person_id, role:roles!assignments_role_id_fkey(name, category, sort_order), person:people!assignments_person_id_fkey(id, full_name))",
        )
        .gte("kickoff_at", startUtc)
        .lte("kickoff_at", endUtc);

      if (error) {
        throw error;
      }

      const matches: ReportMatchRow[] = ((data ?? []) as MatchQueryRow[]).map(
        (row) => ({
          id: row.id,
          kickoffAt: row.kickoff_at,
          competition: row.competition,
          homeTeam: row.home_team,
          awayTeam: row.away_team,
          productionMode: row.production_mode,
          assignments: (row.assignments ?? [])
            .filter((slot) => slot.role)
            .map((slot) => ({
              personId: slot.person?.id ?? slot.person_id,
              personName: slot.person?.full_name ?? null,
              roleName: slot.role?.name ?? "",
              roleCategory: slot.role?.category ?? "",
              roleSortOrder: slot.role?.sort_order ?? 0,
            })),
        }),
      );

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
