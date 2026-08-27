"use server";

import { revalidatePath } from "next/cache";

import { eq } from "drizzle-orm";

import {
  getRedirectTarget,
  redirectWithNotice,
  rethrowNavigationError,
} from "@/app/actions/helpers";
import { defineAction } from "@/lib/actions/define-action";
import {
  parsePersonId,
  parseUpdatePersonAccessRole,
  parseUpsertPerson,
} from "@/lib/actions/parse/people";
import { clearProfileCache, requireEditor } from "@/lib/auth";
import { stampInsert, stampUpdate, writeAudit } from "@/lib/audit";
import {
  ACCESS_TIER_ROLES,
  canManageAccessTier,
  requireAccessManager,
  requireAdmin,
} from "@/lib/auth-access";
import type { AppRole, ProfileRow } from "@/lib/database.types";
import { db } from "@/lib/db/client";
import { profileColumns } from "@/lib/db/rows";
import {
  people as peopleTable,
  peopleTeams as peopleTeamsTable,
  personFunctions as personFunctionsTable,
  profiles as profilesTable,
} from "@/lib/db/schema";
import { ensureErrorMessage, resolveCheckboxFlag } from "@/lib/utils";

// profiles is the single authorization table now (no Supabase Auth users).
// Match email case-insensitively in JS over the small profiles set to avoid
// SQL LIKE-wildcard false positives on emails containing `_` (mirrors auth.ts).
async function findProfileByEmail(email: string): Promise<ProfileRow | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const rows = (await db.select(profileColumns).from(profilesTable)) as ProfileRow[];

  return (
    rows.find((row) => row.email?.toLowerCase() === normalizedEmail) ?? null
  );
}

// Any of these profile roles grants platform login; revoke must cover all of
// them, mirroring personHasPlatformAccess (src/lib/data/platform-access.ts).
const PLATFORM_ACCESS_ROLES = ACCESS_TIER_ROLES;

async function revokePlatformAccessByEmail(
  email: string,
  managerRole: AppRole,
) {
  const profile = await findProfileByEmail(email);

  if (
    !profile ||
    !(PLATFORM_ACCESS_ROLES as readonly string[]).includes(profile.role)
  ) {
    return false;
  }

  // Productores may only revoke Externo logins; revoking an admin/Productor
  // account stays admin-only (canManageAccessTier).
  if (!canManageAccessTier(managerRole, profile.role)) {
    throw new Error("Solo un admin puede revocar este acceso.");
  }

  // Deleting the profiles row removes authorization: getUserContext now returns
  // hasAccess:false and any live Better Auth session lands on /no-access. The
  // people row and its whole history stay; only the link is cut (D-13).
  await db
    .update(peopleTable)
    .set({ profileId: null })
    .where(eq(peopleTable.profileId, profile.id));

  await db.delete(profilesTable).where(eq(profilesTable.id, profile.id));

  clearProfileCache();

  return true;
}

async function findPersonSummaryById(personId: string) {
  const rows = await db
    .select({
      id: peopleTable.id,
      email: peopleTable.email,
      full_name: peopleTable.fullName,
    })
    .from(peopleTable)
    .where(eq(peopleTable.id, personId))
    .limit(1);

  return rows[0] ?? null;
}

const upsertPerson = defineAction({
  fallbackRedirect: "/people",
  authz: requireEditor,
  parse: parseUpsertPerson,
  revalidate: ["/people"],
  onError: (error) => console.error("[people] upsert failed", error),
  async run(ctx, { personId, payload, selectedFunctions, selectedTeamIds }) {
    let rows: { id: string }[];

    if (personId) {
      const stamped = stampUpdate(ctx, payload);
      rows = await db
        .update(peopleTable)
        .set({
          fullName: stamped.full_name,
          phone: stamped.phone,
          email: stamped.email,
          notes: stamped.notes,
          active: stamped.active,
          updatedBy: stamped.updated_by,
          updatedAt: stamped.updated_at,
        })
        .where(eq(peopleTable.id, personId))
        .returning({ id: peopleTable.id });
    } else {
      const stamped = stampInsert(ctx, payload);
      rows = await db
        .insert(peopleTable)
        .values({
          fullName: stamped.full_name,
          phone: stamped.phone,
          email: stamped.email,
          notes: stamped.notes,
          active: stamped.active,
          createdBy: stamped.created_by,
          updatedBy: stamped.updated_by,
          createdAt: stamped.created_at,
          updatedAt: stamped.updated_at,
        })
        .returning({ id: peopleTable.id });
    }

    const row = rows[0];
    if (!row) {
      throw new Error("No se encontró el registro de personal.");
    }
    const savedPersonId = row.id;

    // Replace-all the person's functions (matches the stateless form-submit pattern).
    await db
      .delete(personFunctionsTable)
      .where(eq(personFunctionsTable.personId, savedPersonId));

    if (selectedFunctions.length) {
      // person_functions carries only created_by (no updated_by); set explicitly.
      await db.insert(personFunctionsTable).values(
        selectedFunctions.map((functionKey) => ({
          personId: savedPersonId,
          functionKey,
          createdBy: ctx.profileId,
        })),
      );
    }

    // Replace-all the person's team ("Club") links, mirroring functions above.
    await db
      .delete(peopleTeamsTable)
      .where(eq(peopleTeamsTable.personId, savedPersonId));

    if (selectedTeamIds.length) {
      await db.insert(peopleTeamsTable).values(
        selectedTeamIds.map((teamId) => ({
          personId: savedPersonId,
          teamId,
          createdBy: ctx.profileId,
        })),
      );
    }

    await writeAudit(ctx, {
      table: "people",
      recordId: savedPersonId,
      action: personId ? "UPDATE" : "INSERT",
      before: null,
      after: {
        id: savedPersonId,
        ...payload,
        functions: selectedFunctions,
        teams: selectedTeamIds,
      },
    });

    return {
      notice: personId
        ? "Registro de personal actualizado."
        : "Registro de personal creado.",
    };
  },
});

export async function upsertPersonAction(formData: FormData) {
  await upsertPerson(formData);
}

const deletePerson = defineAction({
  fallbackRedirect: "/people",
  authz: requireAdmin,
  parse: parsePersonId,
  revalidate: ["/people"],
  async run(context, { personId }) {
    const person = await findPersonSummaryById(personId);

    if (!person) {
      throw new Error("No se encontró el usuario a eliminar.");
    }

    if (context.role === "admin" && person.email) {
      await revokePlatformAccessByEmail(person.email, context.role);
    }

    await db.delete(peopleTable).where(eq(peopleTable.id, personId));

    await writeAudit(context, {
      table: "people",
      recordId: personId,
      action: "DELETE",
      before: { id: person.id, full_name: person.full_name },
      after: null,
    });

    return { notice: "Usuario eliminado." };
  },
});

export async function deletePersonAction(formData: FormData) {
  await deletePerson(formData);
}

const revokePersonAccess = defineAction({
  fallbackRedirect: "/people",
  authz: requireAccessManager,
  // A permission error surfaces as a notice instead of an unhandled action
  // rejection.
  authzFailureNotice: true,
  parse: parsePersonId,
  revalidate: ["/people"],
  async run(ctx, { personId }) {
    const person = await findPersonSummaryById(personId);

    if (!person) {
      throw new Error("No se encontró el usuario.");
    }

    if (!person.email) {
      throw new Error("Este usuario no tiene correo asociado.");
    }

    const revoked = await revokePlatformAccessByEmail(person.email, ctx.role);

    if (!revoked) {
      throw new Error("No se encontró acceso de plataforma para revocar.");
    }

    return { notice: "Acceso a la plataforma revocado." };
  },
});

export async function revokePersonAccessAction(formData: FormData) {
  await revokePersonAccess(formData);
}

// Re-tier an existing platform login without revoking it first: only the
// profiles.role changes, so no invite email is re-sent.
const updatePersonAccessRole = defineAction({
  fallbackRedirect: "/people",
  authz: requireAccessManager,
  authzFailureNotice: true,
  parse: parseUpdatePersonAccessRole,
  async run(ctx, { personId, requestedAccessRole }) {
    const person = await findPersonSummaryById(personId);

    if (!person) {
      throw new Error("No se encontró el usuario.");
    }

    if (!person.email) {
      throw new Error("Este usuario no tiene correo asociado.");
    }

    const profile = await findProfileByEmail(person.email);

    if (
      !profile ||
      !(PLATFORM_ACCESS_ROLES as readonly string[]).includes(profile.role)
    ) {
      throw new Error("Este usuario no tiene acceso activo a la plataforma.");
    }

    // Both the current and the target tier must be within reach of the manager,
    // so a productor cannot promote an Externo nor touch an admin/Productor.
    if (
      !canManageAccessTier(ctx.role, profile.role) ||
      !canManageAccessTier(ctx.role, requestedAccessRole)
    ) {
      throw new Error("Solo un admin puede cambiar este nivel de acceso.");
    }

    // Self-demotion would lock the current admin out on the next request.
    if (profile.id === ctx.profileId && requestedAccessRole !== profile.role) {
      throw new Error("No podés cambiar tu propio nivel de acceso.");
    }

    if (profile.role === requestedAccessRole) {
      return { notice: "El nivel de acceso ya estaba actualizado." };
    }

    await db
      .update(profilesTable)
      .set({ role: requestedAccessRole satisfies AppRole })
      .where(eq(profilesTable.id, profile.id));

    clearProfileCache();

    return {
      notice: "Nivel de acceso actualizado.",
      revalidate: ["/people"],
    };
  },
});

export async function updatePersonAccessRoleAction(formData: FormData) {
  await updatePersonAccessRole(formData);
}

// Holdout from defineAction: the success path stays on the page (revalidate
// only, no redirect); only failures redirect with a notice.
export async function togglePersonActiveAction(formData: FormData) {
  const ctx = await requireEditor();

  const personId = String(formData.get("personId") ?? "").trim();
  const nextActive = resolveCheckboxFlag(formData, "active", false);

  try {
    const stamped = stampUpdate(ctx, { active: nextActive });
    await db
      .update(peopleTable)
      .set({
        active: stamped.active,
        updatedBy: stamped.updated_by,
        updatedAt: stamped.updated_at,
      })
      .where(eq(peopleTable.id, personId));

    await writeAudit(ctx, {
      table: "people",
      recordId: personId,
      action: "UPDATE",
      before: null,
      after: { id: personId, active: nextActive },
    });

    revalidatePath("/people");
  } catch (error) {
    rethrowNavigationError(error);
    const redirectTo = getRedirectTarget(formData, "/people");
    redirectWithNotice({
      redirectTo,
      intent: "error",
      notice: ensureErrorMessage(error),
    });
  }
}
