import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { withAuth } from "@/lib/api/with-auth";
import { stampInsert, stampUpdate, writeAudit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import {
  assignments as assignmentsTable,
  collaboratorReports as collaboratorReportsTable,
} from "@/lib/db/schema";
import {
  getCollaboratorMatchData,
  isUuidLike,
} from "@/lib/data/collaborators";
import { ensureErrorMessage } from "@/lib/utils";

const reportDraftSchema = z.object({
  incidentLevel: z.enum(["sin", "baja", "alta", "critica"]),
  feedDetected: z.enum(["si", "no"]),
  problems: z.object({
    internet: z.boolean(),
    img: z.boolean(),
    ocr: z.boolean(),
    overlays: z.boolean(),
    grafica: z.boolean(),
    club: z.boolean(),
    responsableCancha: z.boolean(),
  }),
  signalLabel: z.enum([
    "BP",
    "BP/Deport TV",
    "BP/FDC",
    "BP/Telemundo",
    "BP/FDC/Telemundo",
    "FDC/DTV",
    "FDC/DTV/Telemundo",
    "FDC/TYC",
    "FDC/TYC/Telemundo",
    "FDC/Telemundo",
  ]),
  aptoLineal: z.enum(["si", "no"]),
  testTime: z.string(),
  testCheck: z.enum(["si", "no"]),
  soundCheck: z.enum(["si", "no"]),
  graphicsCheck: z.enum(["si", "no"]),
  internetCheck: z.enum(["si", "no"]),
  cameraCheck: z.enum(["si", "no"]),
  speedtestValue: z.string(),
  pingValue: z.string(),
  gpuValue: z.string(),
  generalObservations: z.string(),
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

  const hasObservations = Boolean(draft.generalObservations.trim());

  if (draft.incidentLevel !== "sin" && !hasObservations) {
    return NextResponse.json(
      { error: "Completa las observaciones antes de enviar una incidencia." },
      { status: 400 },
    );
  }

  if (!isUuidLike(assignmentId) || !isUuidLike(matchId)) {
    return NextResponse.json(
      { error: "El envío real no está disponible en modo demo." },
      { status: 400 },
    );
  }

  try {
    const access = await getCollaboratorMatchData(ctx, {
      profileId: ctx.profileId,
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

    // stampInsert({}) yields only the actor/timestamp columns (snake_case);
    // the domain columns are written directly in camelCase below.
    const stamp = stampInsert(ctx, {});
    const reportValues = {
      assignmentId,
      matchId,
      reporterProfileId: ctx.profileId,
      incidentLevel: draft.incidentLevel,
      feedDetected: draft.feedDetected === "si",
      signalLabel: draft.signalLabel,
      aptoLineal: draft.aptoLineal === "si",
      testTime: draft.testTime.trim() || null,
      testCheck: draft.testCheck === "si",
      soundCheck: draft.soundCheck === "si",
      graphicsCheck: draft.graphicsCheck === "si",
      internetCheck: draft.internetCheck === "si",
      cameraCheck: draft.cameraCheck === "si",
      speedtestValue: draft.speedtestValue.trim() || null,
      pingValue: draft.pingValue.trim() || null,
      gpuValue: draft.gpuValue.trim() || null,
      generalObservations: draft.generalObservations.trim() || null,
      // Retired form fields: null them so a re-sent report doesn't keep stale text.
      technicalObservations: null,
      buildingObservations: null,
      problems: {
        ...draft.problems,
        hasAny: hasEnabledProblems(draft.problems),
      },
      attachments: {
        speedtest: draft.speedtestAttachmentName,
        ping: draft.pingAttachmentName,
        gpu: draft.gpuAttachmentName,
      },
      submittedAt: new Date().toISOString(),
      createdBy: stamp.created_by,
      updatedBy: stamp.updated_by,
      createdAt: stamp.created_at,
      updatedAt: stamp.updated_at,
    };

    // ON CONFLICT (assignment_id) refreshes every non-target column, mirroring
    // the retired PostgREST upsert.
    const { assignmentId: _conflictKey, ...reportUpdate } = reportValues;
    void _conflictKey;

    let reportId: string | undefined;
    try {
      const rows = await db
        .insert(collaboratorReportsTable)
        .values(reportValues)
        .onConflictDoUpdate({
          target: collaboratorReportsTable.assignmentId,
          set: reportUpdate,
        })
        .returning({ id: collaboratorReportsTable.id });
      reportId = rows[0]?.id;
    } catch (error) {
      if ((error as { code?: string }).code === "42P01") {
        return NextResponse.json(
          {
            error:
              "Falta aplicar la migración de reportes de colaborador antes de enviar.",
          },
          { status: 503 },
        );
      }

      throw error;
    }

    if (!reportId) {
      throw new Error("No pudimos guardar el reporte.");
    }

    await writeAudit(ctx, {
      table: "collaborator_reports",
      recordId: reportId,
      matchId,
      action: "INSERT",
      before: null,
      after: { id: reportId, assignment_id: assignmentId, match_id: matchId },
    });

    const assignmentStamp = stampUpdate(ctx, { confirmed: true });
    await db
      .update(assignmentsTable)
      .set({
        confirmed: assignmentStamp.confirmed,
        updatedBy: assignmentStamp.updated_by,
        updatedAt: assignmentStamp.updated_at,
      })
      .where(eq(assignmentsTable.id, assignmentId));

    await writeAudit(ctx, {
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
      reportId,
      message: "Reporte enviado. Marcamos este partido como reportado.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: ensureErrorMessage(error) },
      { status: 500 },
    );
  }
});
