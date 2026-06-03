import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withAuth } from "@/lib/api/with-auth";
import { stampInsert, stampUpdate, writeAudit } from "@/lib/audit";
import {
  getCollaboratorMatchData,
  isUuidLike,
} from "@/lib/data/collaborators";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureErrorMessage } from "@/lib/utils";

const reportDraftSchema = z.object({
  incidentLevel: z.enum(["sin", "baja", "alta", "critica"]),
  paid: z.enum(["si", "no"]),
  feedDetected: z.enum(["si", "no"]),
  problems: z.object({
    internet: z.boolean(),
    img: z.boolean(),
    ocr: z.boolean(),
    overlays: z.boolean(),
    grafica: z.boolean(),
  }),
  signalLabel: z.enum(["BP", "BP / IMG"]),
  aptoLineal: z.enum(["si", "no"]),
  testTime: z.string(),
  testCheck: z.enum(["si", "no"]),
  startCheck: z.enum(["si", "no"]),
  graphicsCheck: z.enum(["si", "no"]),
  speedtestValue: z.string(),
  pingValue: z.string(),
  gpuValue: z.string(),
  technicalObservations: z.string(),
  buildingObservations: z.string(),
  generalObservations: z.string(),
  otherObservation: z.string(),
  stObservation: z.string(),
  clubObservation: z.string(),
  speedtestAttachmentName: z.string().nullable(),
  pingAttachmentName: z.string().nullable(),
  gpuAttachmentName: z.string().nullable(),
  updatedAt: z.string().optional(),
});

const requestSchema = z.object({
  assignmentId: z.string().trim().min(1),
  matchId: z.string().trim().min(1),
  draft: reportDraftSchema,
});

function hasEnabledProblems(
  value: z.infer<typeof reportDraftSchema>["problems"],
) {
  return Object.values(value).some(Boolean);
}

// withAuth({}) is the structural 401 seam (D-04 marker for plan 05's D-07
// coverage test). The finer-grained per-match 403 check stays in the handler.
export const POST = withAuth({}, async (request, ctx) => {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "No pudimos leer el reporte enviado." },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "El formato del reporte no es válido." },
      { status: 400 },
    );
  }

  const { assignmentId, matchId, draft } = parsed.data;

  if (!isUuidLike(assignmentId) || !isUuidLike(matchId)) {
    return NextResponse.json(
      { error: "El envío real no está disponible en modo demo." },
      { status: 400 },
    );
  }

  try {
    const access = await getCollaboratorMatchData(ctx, {
      email: ctx.email,
      profileName: ctx.profile?.full_name ?? null,
      matchId,
    });

    if (
      access.trialAccess ||
      !access.assignmentsForMatch.some(
        (assignment) => assignment.assignmentId === assignmentId,
      )
    ) {
      return NextResponse.json(
        { error: "No tienes acceso a este partido para enviar el reporte." },
        { status: 403 },
      );
    }

    const supabase = await createSupabaseServerClient();

    const reportResult = await supabase
      .from("collaborator_reports")
      .upsert(
        stampInsert(ctx, {
          assignment_id: assignmentId,
          match_id: matchId,
          reporter_profile_id: ctx.userId,
          incident_level: draft.incidentLevel,
          paid: draft.paid === "si",
          feed_detected: draft.feedDetected === "si",
          signal_label: draft.signalLabel,
          apto_lineal: draft.aptoLineal === "si",
          test_time: draft.testTime.trim() || null,
          test_check: draft.testCheck === "si",
          start_check: draft.startCheck === "si",
          graphics_check: draft.graphicsCheck === "si",
          speedtest_value: draft.speedtestValue.trim() || null,
          ping_value: draft.pingValue.trim() || null,
          gpu_value: draft.gpuValue.trim() || null,
          technical_observations: draft.technicalObservations.trim() || null,
          building_observations: draft.buildingObservations.trim() || null,
          general_observations: draft.generalObservations.trim() || null,
          other_flag: Boolean(draft.otherObservation.trim()),
          st_flag: Boolean(draft.stObservation.trim()),
          club_flag: Boolean(draft.clubObservation.trim()),
          other_observation: draft.otherObservation.trim() || null,
          st_observation: draft.stObservation.trim() || null,
          club_observation: draft.clubObservation.trim() || null,
          problems: {
            ...draft.problems,
            hasAny: hasEnabledProblems(draft.problems),
          },
          attachments: {
            speedtest: draft.speedtestAttachmentName,
            ping: draft.pingAttachmentName,
            gpu: draft.gpuAttachmentName,
          },
          submitted_at: new Date().toISOString(),
        }),
        { onConflict: "assignment_id" },
      )
      .select("id")
      .single();

    if (reportResult.error) {
      if (reportResult.error.code === "42P01") {
        return NextResponse.json(
          {
            error:
              "Falta aplicar la migración de reportes de colaborador antes de enviar.",
          },
          { status: 503 },
        );
      }

      throw reportResult.error;
    }

    await writeAudit(supabase, ctx, {
      table: "collaborator_reports",
      recordId: reportResult.data.id,
      matchId,
      action: "INSERT",
      before: null,
      after: { id: reportResult.data.id, assignment_id: assignmentId, match_id: matchId },
    });

    const assignmentResult = await supabase
      .from("assignments")
      .update(stampUpdate(ctx, { confirmed: true }))
      .eq("id", assignmentId);

    if (assignmentResult.error) {
      throw assignmentResult.error;
    }

    await writeAudit(supabase, ctx, {
      table: "assignments",
      recordId: assignmentId,
      matchId,
      action: "UPDATE",
      before: null,
      after: { id: assignmentId, confirmed: true },
    });

    revalidatePath("/mi-jornada");
    revalidatePath(`/mi-jornada/${matchId}/reportar`);
    revalidatePath("/grid");
    revalidatePath(`/match/${matchId}`);
    revalidatePath("/reports");
    revalidatePath("/incidents");

    return NextResponse.json({
      ok: true,
      reportId: reportResult.data.id,
      message: "Reporte enviado. Marcamos este partido como reportado.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: ensureErrorMessage(error) },
      { status: 500 },
    );
  }
});
