"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { defineAction } from "@/lib/actions/define-action";
import {
  parseApproveAccessRequest,
  parseLinkProfileToPerson,
  parseRejectAccessRequest,
  parseSubmitAccessRequest,
} from "@/lib/actions/parse/access-requests";
import {
  isAccessRequestFuncion,
  type AccessRequestStatus,
} from "@/lib/access-requests/constants";
import { notifyAccessRequest } from "@/lib/access-requests/notify";
import { isE164Phone } from "@/lib/access-requests/phone";
import {
  canSubmitAccessRequest,
  resolveDecision,
} from "@/lib/access-requests/state";
import { clearProfileCache, requireUserContext } from "@/lib/auth";
import {
  canManageAccessTier,
  requireAccessRequestApprover,
  requireAdmin,
  type AccessTierRole,
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

const REQUEST_REVALIDATE_PATHS = [
  "/no-access",
  "/notifications/solicitudes",
  "/people",
];

const submitAccessRequest = defineAction({
  fallbackRedirect: "/no-access",
  authz: requireUserContext,
  parse: parseSubmitAccessRequest,
  revalidate: REQUEST_REVALIDATE_PATHS,
  async run(ctx, { fullName, phone, funcion, mensaje }) {
    if (!ctx.userId || !ctx.email) {
      throw new Error("Necesitás iniciar sesión para pedir acceso.");
    }

    if (fullName.length < 3) {
      throw new Error("Escribí tu nombre completo.");
    }

    if (!isE164Phone(phone)) {
      throw new Error("Revisá el teléfono: falta el país o tiene caracteres.");
    }

    if (!isAccessRequestFuncion(funcion)) {
      throw new Error("Elegí una función de la lista.");
    }

    const email = ctx.email.trim().toLowerCase();
    const pendingRows = await db
      .select({ status: accessRequestsTable.status })
      .from(accessRequestsTable)
      .where(
        and(
          sql`lower(${accessRequestsTable.email}) = ${email}`,
          eq(accessRequestsTable.status, "pendiente"),
        ),
      )
      .limit(1);

    const existing = pendingRows[0]
      ? { status: pendingRows[0].status as AccessRequestStatus }
      : null;

    if (!canSubmitAccessRequest(existing).ok) {
      throw new Error("Ya tenés una solicitud pendiente.");
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

    return {
      notice: "Solicitud enviada. Te avisamos por correo cuando se apruebe.",
    };
  },
});

export async function submitAccessRequestAction(formData: FormData) {
  await submitAccessRequest(formData);
}

const rejectAccessRequest = defineAction({
  fallbackRedirect: "/grid",
  authz: requireAccessRequestApprover,
  // A permission error surfaces as a notice instead of an unhandled action
  // rejection (mirrors revokePersonAccessAction).
  authzFailureNotice: true,
  parse: parseRejectAccessRequest,
  revalidate: REQUEST_REVALIDATE_PATHS,
  async run(ctx, { requestId }) {
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

    // Compare-and-set: the status predicate is what actually serializes two
    // approvers clicking at once, not the read above (D-06, first decision wins).
    const decided = await db
      .update(accessRequestsTable)
      .set({
        status: decision.status,
        decidedAt: new Date().toISOString(),
        decidedBy: ctx.profileId,
      })
      .where(
        and(
          eq(accessRequestsTable.id, requestId),
          eq(accessRequestsTable.status, "pendiente"),
        ),
      )
      .returning({ id: accessRequestsTable.id });

    if (!decided[0]) {
      throw new Error("Esta solicitud ya fue resuelta.");
    }

    await writeAudit(ctx, {
      table: "access_requests",
      recordId: requestId,
      action: "UPDATE",
      before: { status: "pendiente" },
      after: { status: decision.status },
    });

    return { notice: "Solicitud rechazada." };
  },
});

export async function rejectAccessRequestAction(formData: FormData) {
  await rejectAccessRequest(formData);
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

const approveAccessRequest = defineAction({
  fallbackRedirect: "/grid",
  authz: requireAccessRequestApprover,
  // A permission error surfaces as a notice instead of an unhandled action
  // rejection (mirrors revokePersonAccessAction).
  authzFailureNotice: true,
  parse: parseApproveAccessRequest,
  revalidate: REQUEST_REVALIDATE_PATHS,
  async run(
    ctx,
    { requestId, fullName, phone, roleId, personId, mergePersonId, requestedTier },
  ) {
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

    const result = await db.transaction(async (tx) => {
      // Claim the request first, inside the transaction: the status predicate is
      // the compare-and-set that makes the first decision the only one (D-06).
      // Everything below runs only for the approver that won the claim.
      const claimed = await tx
        .update(accessRequestsTable)
        .set({
          status: "aprobada",
          decidedAt: new Date().toISOString(),
          decidedBy: ctx.profileId,
        })
        .where(
          and(
            eq(accessRequestsTable.id, requestId),
            eq(accessRequestsTable.status, "pendiente"),
          ),
        )
        .returning({ email: accessRequestsTable.email });

      if (!claimed[0]) {
        throw new Error("Esta solicitud ya fue resuelta.");
      }

      const email = claimed[0].email.trim().toLowerCase();
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
        .set({ profileId, personId: savedPersonId })
        .where(eq(accessRequestsTable.id, requestId));

      return { profileId, personId: savedPersonId, email };
    });

    clearProfileCache();

    await writeAudit(ctx, {
      table: "access_requests",
      recordId: requestId,
      action: "UPDATE",
      before: { status: "pendiente" },
      after: {
        status: "aprobada",
        email: result.email,
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
        to: result.email,
        loginUrl: `${appEnv.portalBaseUrl}/login`,
      });
    } catch (error) {
      console.error("[access-requests] invite email failed", error);
      emailNotice = " No pudimos enviarle el correo de aviso.";
    }

    return { notice: `Solicitud aprobada.${emailNotice}` };
  },
});

export async function approveAccessRequestAction(formData: FormData) {
  await approveAccessRequest(formData);
}

// Resolves one row of the 0034 backfill review list: link an account to the
// ficha an admin confirms is the same person (D-09). Admin-only — the review
// list lives on an admin-only page.
const linkProfileToPerson = defineAction({
  fallbackRedirect: "/notifications/solicitudes",
  authz: requireAdmin,
  authzFailureNotice: true,
  parse: parseLinkProfileToPerson,
  revalidate: REQUEST_REVALIDATE_PATHS,
  async run(ctx, { profileId, personId }) {
    // Only an unlinked ficha may be claimed, so this can never steal a link
    // another account already owns.
    const linked = await db
      .update(peopleTable)
      .set({
        profileId,
        updatedBy: ctx.profileId,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(peopleTable.id, personId), isNull(peopleTable.profileId)))
      .returning({ id: peopleTable.id });

    if (!linked[0]) {
      throw new Error("Esa ficha ya está vinculada a otra cuenta.");
    }

    await writeAudit(ctx, {
      table: "people",
      recordId: personId,
      action: "UPDATE",
      before: null,
      after: { id: personId, profile_id: profileId },
    });

    clearProfileCache();

    return { notice: "Cuenta vinculada a la ficha." };
  },
});

export async function linkProfileToPersonAction(formData: FormData) {
  await linkProfileToPerson(formData);
}
