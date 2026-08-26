"use server";

import { revalidatePath } from "next/cache";

import { and, eq, inArray, sql } from "drizzle-orm";

import {
  getRedirectTarget,
  redirectWithNotice,
  rethrowNavigationError,
} from "@/app/actions/helpers";
import {
  isAccessRequestFuncion,
  type AccessRequestStatus,
} from "@/lib/access-requests/constants";
import { notifyAccessRequest } from "@/lib/access-requests/notify";
import {
  canSubmitAccessRequest,
  resolveDecision,
} from "@/lib/access-requests/state";
import { clearProfileCache, requireUserContext } from "@/lib/auth";
import {
  canManageAccessTier,
  requireAccessRequestApprover,
} from "@/lib/auth-access";
import { stampInsert, stampUpdate, writeAudit } from "@/lib/audit";
import type { AppRole } from "@/lib/database.types";
import { db } from "@/lib/db/client";
import {
  accessRequests as accessRequestsTable,
  assignments as assignmentsTable,
  matches as matchesTable,
  notificationLogs as notificationLogsTable,
  people as peopleTable,
  peopleTeams as peopleTeamsTable,
  personFunctions as personFunctionsTable,
  profiles as profilesTable,
  roles as rolesTable,
} from "@/lib/db/schema";
import { sendCollaboratorInviteEmail } from "@/lib/email/mailer";
import { appEnv } from "@/lib/env";
import { ensureErrorMessage, maybeNull } from "@/lib/utils";

const ACCESS_TIER_ROLES = ["admin", "editor", "collaborator"] as const;

type AccessTierRole = (typeof ACCESS_TIER_ROLES)[number];

function normalizeAccessTier(value: string): AccessTierRole {
  const normalized = value.trim().toLowerCase();

  return (ACCESS_TIER_ROLES as readonly string[]).includes(normalized)
    ? (normalized as AccessTierRole)
    : "collaborator";
}

// E.164 as produced by the flags input: "+" then 8-15 digits. Stored verbatim;
// sanitizePhone strips it to digits wherever WhatsApp needs them.
const PHONE_PATTERN = /^\+\d{8,15}$/;

const REQUEST_REVALIDATE_PATHS = [
  "/no-access",
  "/notifications/solicitudes",
  "/people",
];

function revalidateRequestSurfaces() {
  REQUEST_REVALIDATE_PATHS.forEach((path) => {
    revalidatePath(path);
  });
}

export async function submitAccessRequestAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/no-access");
  const ctx = await requireUserContext();

  try {
    if (!ctx.userId || !ctx.email) {
      throw new Error("Necesitás iniciar sesión para pedir acceso.");
    }

    const fullName = String(formData.get("fullName") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const funcion = String(formData.get("funcion") ?? "").trim();
    const mensaje = maybeNull(String(formData.get("mensaje") ?? ""));

    if (fullName.length < 3) {
      throw new Error("Escribí tu nombre completo.");
    }

    if (!PHONE_PATTERN.test(phone)) {
      throw new Error("Revisá el teléfono: falta el país o tiene caracteres.");
    }

    if (!isAccessRequestFuncion(funcion)) {
      throw new Error("Elegí una función de la lista.");
    }

    const email = ctx.email.trim().toLowerCase();
    const existingRows = await db
      .select({ status: accessRequestsTable.status })
      .from(accessRequestsTable)
      .where(sql`lower(${accessRequestsTable.email}) = ${email}`)
      .limit(1);

    const existing = existingRows[0]
      ? { status: existingRows[0].status as AccessRequestStatus }
      : null;
    const gate = canSubmitAccessRequest(existing);

    if (!gate.ok) {
      throw new Error(
        gate.reason === "pendiente"
          ? "Ya tenés una solicitud pendiente."
          : "Ya hay una solicitud registrada con este correo.",
      );
    }

    await db.insert(accessRequestsTable).values({
      authUserId: ctx.userId,
      email,
      fullName,
      phone,
      funcion,
      mensaje,
      status: "pendiente",
    });

    // The request is persisted; the notification is best-effort on purpose.
    try {
      await notifyAccessRequest({ fullName, email, phone, funcion, mensaje });
    } catch (error) {
      console.error("[access-requests] notification failed", error);
    }

    revalidateRequestSurfaces();
    redirectWithNotice({
      redirectTo,
      intent: "success",
      notice: "Solicitud enviada. Te avisamos por correo cuando se apruebe.",
    });
  } catch (error) {
    rethrowNavigationError(error);
    redirectWithNotice({
      redirectTo,
      intent: "error",
      notice: ensureErrorMessage(error),
    });
  }
}

export async function rejectAccessRequestAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/grid");
  const requestId = String(formData.get("requestId") ?? "").trim();

  try {
    // Inside the try so a permission error surfaces as a notice instead of an
    // unhandled action rejection (mirrors revokePersonAccessAction).
    const ctx = await requireAccessRequestApprover();
    const rows = await db
      .select({ id: accessRequestsTable.id, status: accessRequestsTable.status })
      .from(accessRequestsTable)
      .where(eq(accessRequestsTable.id, requestId))
      .limit(1);

    const request = rows[0];

    if (!request) {
      throw new Error("No se encontró la solicitud.");
    }

    const decision = resolveDecision(
      { status: request.status as AccessRequestStatus },
      "rechazar",
    );

    if (!decision.ok) {
      throw new Error("Esta solicitud ya fue resuelta.");
    }

    await db
      .update(accessRequestsTable)
      .set({
        status: decision.status,
        decidedAt: new Date().toISOString(),
        decidedBy: ctx.profileId,
      })
      .where(eq(accessRequestsTable.id, requestId));

    await writeAudit(ctx, {
      table: "access_requests",
      recordId: requestId,
      action: "UPDATE",
      before: { status: "pendiente" },
      after: { status: decision.status },
    });

    revalidateRequestSurfaces();
    redirectWithNotice({
      redirectTo,
      intent: "success",
      notice: "Solicitud rechazada.",
    });
  } catch (error) {
    rethrowNavigationError(error);
    redirectWithNotice({
      redirectTo,
      intent: "error",
      notice: ensureErrorMessage(error),
    });
  }
}

// Repoint every referrer of the duplicate onto the survivor, then soft-delete it.
// Never a hard DELETE: the old row can own past grillas (D-14).
async function mergePersonInto(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  {
    fromPersonId,
    intoPersonId,
    actorProfileId,
  }: { fromPersonId: string; intoPersonId: string; actorProfileId: string | null },
) {
  await tx
    .update(assignmentsTable)
    .set({ personId: intoPersonId })
    .where(eq(assignmentsTable.personId, fromPersonId));

  await tx
    .update(matchesTable)
    .set({ ownerId: intoPersonId })
    .where(eq(matchesTable.ownerId, fromPersonId));

  await tx
    .update(notificationLogsTable)
    .set({ personId: intoPersonId })
    .where(eq(notificationLogsTable.personId, fromPersonId));

  // people_teams and person_functions are (person, x) unique pairs: move the
  // ones the survivor lacks and drop the rest rather than fight the constraint.
  const survivorTeams = await tx
    .select({ teamId: peopleTeamsTable.teamId })
    .from(peopleTeamsTable)
    .where(eq(peopleTeamsTable.personId, intoPersonId));
  const survivorTeamIds = survivorTeams.map((row) => row.teamId);

  if (survivorTeamIds.length) {
    await tx
      .delete(peopleTeamsTable)
      .where(
        and(
          eq(peopleTeamsTable.personId, fromPersonId),
          inArray(peopleTeamsTable.teamId, survivorTeamIds),
        ),
      );
  }

  await tx
    .update(peopleTeamsTable)
    .set({ personId: intoPersonId })
    .where(eq(peopleTeamsTable.personId, fromPersonId));

  const survivorFunctions = await tx
    .select({ functionKey: personFunctionsTable.functionKey })
    .from(personFunctionsTable)
    .where(eq(personFunctionsTable.personId, intoPersonId));
  const survivorFunctionKeys = survivorFunctions.map((row) => row.functionKey);

  if (survivorFunctionKeys.length) {
    await tx
      .delete(personFunctionsTable)
      .where(
        and(
          eq(personFunctionsTable.personId, fromPersonId),
          inArray(personFunctionsTable.functionKey, survivorFunctionKeys),
        ),
      );
  }

  await tx
    .update(personFunctionsTable)
    .set({ personId: intoPersonId })
    .where(eq(personFunctionsTable.personId, fromPersonId));

  await tx
    .update(peopleTable)
    .set({
      deletedAt: new Date().toISOString(),
      active: false,
      profileId: null,
      updatedBy: actorProfileId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(peopleTable.id, fromPersonId));
}

export async function approveAccessRequestAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/grid");
  const requestId = String(formData.get("requestId") ?? "").trim();

  try {
    // Inside the try so a permission error surfaces as a notice instead of an
    // unhandled action rejection (mirrors revokePersonAccessAction).
    const ctx = await requireAccessRequestApprover();
    const requestRows = await db
      .select({
        id: accessRequestsTable.id,
        email: accessRequestsTable.email,
        status: accessRequestsTable.status,
      })
      .from(accessRequestsTable)
      .where(eq(accessRequestsTable.id, requestId))
      .limit(1);

    const request = requestRows[0];

    if (!request) {
      throw new Error("No se encontró la solicitud.");
    }

    const decision = resolveDecision(
      { status: request.status as AccessRequestStatus },
      "aprobar",
    );

    if (!decision.ok) {
      throw new Error("Esta solicitud ya fue resuelta.");
    }

    // What the approver submitted is what persists (D-10).
    const fullName = String(formData.get("fullName") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const roleId = maybeNull(String(formData.get("roleId") ?? ""));
    const personId = maybeNull(String(formData.get("personId") ?? ""));
    const mergePersonId = maybeNull(String(formData.get("mergePersonId") ?? ""));
    const requestedTier = normalizeAccessTier(
      String(formData.get("accessRole") ?? "collaborator"),
    );

    if (fullName.length < 3) {
      throw new Error("El nombre completo no puede quedar vacío.");
    }

    if (!PHONE_PATTERN.test(phone)) {
      throw new Error("Revisá el teléfono antes de aprobar.");
    }

    // Productores can only mint Externo logins; downgrade anything higher rather
    // than trusting the submitted tier.
    const accessRole: AccessTierRole = canManageAccessTier(
      ctx.role,
      requestedTier,
    )
      ? requestedTier
      : "collaborator";

    if (roleId) {
      const roleRows = await db
        .select({ id: rolesTable.id })
        .from(rolesTable)
        .where(eq(rolesTable.id, roleId))
        .limit(1);

      if (!roleRows[0]) {
        throw new Error("La función elegida ya no existe.");
      }
    }

    const email = request.email.trim().toLowerCase();

    const result = await db.transaction(async (tx) => {
      const profileRows = (await tx
        .select({ id: profilesTable.id, role: profilesTable.role })
        .from(profilesTable)
        .where(sql`lower(${profilesTable.email}) = ${email}`)
        .limit(1)) as { id: string; role: AppRole }[];

      let profileId = profileRows[0]?.id ?? null;

      if (profileId) {
        await tx
          .update(profilesTable)
          .set({ role: accessRole satisfies AppRole, fullName })
          .where(eq(profilesTable.id, profileId));
      } else {
        profileId = globalThis.crypto.randomUUID();
        await tx.insert(profilesTable).values({
          id: profileId,
          email,
          fullName,
          role: accessRole satisfies AppRole,
          authUserId: null,
        });
      }

      let savedPersonId = personId;

      if (savedPersonId) {
        const stamped = stampUpdate(ctx, {});
        await tx
          .update(peopleTable)
          .set({
            fullName,
            phone,
            email,
            roleId,
            active: true,
            deletedAt: null,
            profileId,
            updatedBy: stamped.updated_by,
            updatedAt: stamped.updated_at,
          })
          .where(eq(peopleTable.id, savedPersonId));
      } else {
        const stamped = stampInsert(ctx, {});
        const inserted = await tx
          .insert(peopleTable)
          .values({
            fullName,
            phone,
            email,
            roleId,
            active: true,
            profileId,
            createdBy: stamped.created_by,
            updatedBy: stamped.updated_by,
            createdAt: stamped.created_at,
            updatedAt: stamped.updated_at,
          })
          .returning({ id: peopleTable.id });

        savedPersonId = inserted[0]?.id ?? null;
      }

      if (!savedPersonId) {
        throw new Error("No pudimos crear la ficha de la persona.");
      }

      if (mergePersonId && mergePersonId !== savedPersonId) {
        await mergePersonInto(tx, {
          fromPersonId: mergePersonId,
          intoPersonId: savedPersonId,
          actorProfileId: ctx.profileId,
        });
      }

      await tx
        .update(accessRequestsTable)
        .set({
          status: decision.status,
          decidedAt: new Date().toISOString(),
          decidedBy: ctx.profileId,
          profileId,
          personId: savedPersonId,
        })
        .where(eq(accessRequestsTable.id, requestId));

      return { profileId, personId: savedPersonId };
    });

    clearProfileCache();

    await writeAudit(ctx, {
      table: "access_requests",
      recordId: requestId,
      action: "UPDATE",
      before: { status: "pendiente" },
      after: {
        status: decision.status,
        email,
        full_name: fullName,
        phone,
        role_id: roleId,
        access_role: accessRole,
        profile_id: result.profileId,
        person_id: result.personId,
        merged_person_id: mergePersonId,
      },
    });

    // The approval is committed: a failing invite must not undo it.
    let emailNotice = "";
    try {
      await sendCollaboratorInviteEmail({
        to: email,
        loginUrl: `${appEnv.portalBaseUrl}/login`,
      });
    } catch (error) {
      console.error("[access-requests] invite email failed", error);
      emailNotice = " No pudimos enviarle el correo de aviso.";
    }

    revalidateRequestSurfaces();
    redirectWithNotice({
      redirectTo,
      intent: "success",
      notice: `Solicitud aprobada.${emailNotice}`,
    });
  } catch (error) {
    rethrowNavigationError(error);
    redirectWithNotice({
      redirectTo,
      intent: "error",
      notice: ensureErrorMessage(error),
    });
  }
}
