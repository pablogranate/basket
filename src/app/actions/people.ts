"use server";

import { revalidatePath } from "next/cache";

import {
  getRedirectTarget,
  redirectWithNotice,
  rethrowNavigationError,
} from "@/app/actions/helpers";
import { eq } from "drizzle-orm";

import { clearProfileCache, requireEditor } from "@/lib/auth";
import { stampInsert, stampUpdate, writeAudit } from "@/lib/audit";
import {
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
import { sendCollaboratorInviteEmail } from "@/lib/email/mailer";
import { isPersonFunctionKey, resolveFunctionKey } from "@/lib/functions";
import { appEnv } from "@/lib/env";
import { buildPersonNotesMeta } from "@/lib/people-notes";
import { ensureErrorMessage, maybeNull } from "@/lib/utils";

// Access-grant tiers map onto the profiles.role enum: Admin/Productor/Externo.
// Unknown or missing input falls back to the least-privileged tier (Externo).
const ACCESS_TIER_ROLES = ["admin", "editor", "collaborator"] as const;

type AccessTierRole = (typeof ACCESS_TIER_ROLES)[number];

function normalizeAccessTier(value: string): AccessTierRole {
  const normalized = value.trim().toLowerCase();

  return (ACCESS_TIER_ROLES as readonly string[]).includes(normalized)
    ? (normalized as AccessTierRole)
    : "collaborator";
}

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
  // hasAccess:false and any live Better Auth session lands on /no-access.
  await db.delete(profilesTable).where(eq(profilesTable.id, profile.id));

  clearProfileCache();

  return true;
}

// Provision (or re-tier) platform login for a person and send the invite email.
// Shared by the create/edit upsert flow and the standalone grant action.
async function grantPlatformAccess({
  email,
  fullName,
  role,
}: {
  email: string;
  fullName: string;
  role: AccessTierRole;
}): Promise<{ emailSent: boolean }> {
  const existingProfile = await findProfileByEmail(email);

  if (existingProfile) {
    // Change-tier: granting access to an already-provisioned user moves them to
    // the selected tier. Keep id/auth_user_id so a later first login auto-links.
    await db
      .update(profilesTable)
      .set({
        role: role satisfies AppRole,
        fullName,
      })
      .where(eq(profilesTable.id, existingProfile.id));
  } else {
    // No auth user created: a fresh profiles row keyed by a new uuid with
    // auth_user_id NULL. First login (Google/magic link) auto-links by email
    // and stamps auth_user_id (see getUserContext).
    await db.insert(profilesTable).values({
      id: globalThis.crypto.randomUUID(),
      email,
      fullName,
      role: role satisfies AppRole,
      authUserId: null,
    });
  }

  clearProfileCache();

  await sendCollaboratorInviteEmail({
    to: email,
    loginUrl: `${appEnv.appUrl}/login`,
  });

  return { emailSent: true };
}

export async function upsertPersonAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/people");
  const ctx = await requireEditor();
  const hasActiveField = formData.has("active");
  const createPlatformAccess =
    String(formData.get("createPlatformAccess") ?? "off") === "on";
  const requestedAccessRole = normalizeAccessTier(
    String(formData.get("accessRole") ?? "collaborator"),
  );
  // Productores can only mint Externo logins; downgrade any higher tier they
  // request rather than trusting the submitted value.
  const accessRole: AccessTierRole = canManageAccessTier(
    ctx.role,
    requestedAccessRole,
  )
    ? requestedAccessRole
    : "collaborator";

  const roleNameInput = maybeNull(String(formData.get("roleName") ?? ""));

  const payload = {
    full_name: String(formData.get("fullName") ?? "").trim(),
    phone: maybeNull(String(formData.get("phone") ?? "")),
    email: maybeNull(String(formData.get("email") ?? "")),
    notes: buildPersonNotesMeta({
      role: roleNameInput,
      city: maybeNull(String(formData.get("city") ?? "")),
      coverage: maybeNull(String(formData.get("coverageTeams") ?? "")),
      notes: maybeNull(String(formData.get("notes") ?? "")),
    }),
    active: hasActiveField
      ? String(formData.get("active") ?? "") !== "off"
      : true,
  };

  // Canonical capabilities: validate at the boundary, dedupe, and fall back to
  // the legacy free-text role only when no functions were submitted.
  let selectedFunctions = Array.from(
    new Set(
      formData
        .getAll("functions")
        .map((value) => String(value))
        .filter(isPersonFunctionKey),
    ),
  );

  if (selectedFunctions.length === 0) {
    const legacy = resolveFunctionKey(roleNameInput);
    if (legacy) {
      selectedFunctions = [legacy];
    }
  }

  // "Club" links: the person's team FKs, submitted as repeated teamIds fields.
  const selectedTeamIds = Array.from(
    new Set(
      formData
        .getAll("teamIds")
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  );

  try {
    if (createPlatformAccess) {
      await requireAccessManager();

      if (!payload.email) {
        throw new Error("Ingresa un correo electrónico antes de crear acceso.");
      }
    }

    const personId = String(formData.get("personId") ?? "");
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

    let accessNotice: string | null = null;
    let accessEmailSent = false;

    if (createPlatformAccess && payload.email) {
      try {
        const granted = await grantPlatformAccess({
          email: payload.email,
          fullName: payload.full_name,
          role: accessRole,
        });
        accessEmailSent = granted.emailSent;
      } catch (error) {
        console.error("[people] failed to create platform access", error);
        accessNotice = ensureErrorMessage(error);
      }
    }

    revalidatePath("/people");
    redirectWithNotice({
      redirectTo,
      intent: accessNotice ? "error" : "success",
      notice: accessNotice
        ? personId
          ? `Registro actualizado, pero no se pudo habilitar el acceso: ${accessNotice}`
          : `Registro creado, pero no se pudo habilitar el acceso: ${accessNotice}`
        : createPlatformAccess
          ? personId
            ? accessEmailSent
              ? "Registro actualizado, acceso de colaborador habilitado y correo enviado."
              : "Registro actualizado y acceso de colaborador creado."
            : accessEmailSent
              ? "Registro creado, acceso de colaborador habilitado y correo enviado."
              : "Registro creado y acceso de colaborador habilitado."
          : personId
            ? "Registro de personal actualizado."
            : "Registro de personal creado.",
    });
  } catch (error) {
    console.error("[people] upsert failed", error);
    rethrowNavigationError(error);
    redirectWithNotice({
      redirectTo,
      intent: "error",
      notice: ensureErrorMessage(error),
    });
  }
}

export async function deletePersonAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/people");
  const context = await requireAdmin();
  const personId = String(formData.get("personId") ?? "").trim();

  try {
    const personRows = await db
      .select({
        id: peopleTable.id,
        email: peopleTable.email,
        full_name: peopleTable.fullName,
      })
      .from(peopleTable)
      .where(eq(peopleTable.id, personId))
      .limit(1);

    const person = personRows[0];

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

    revalidatePath("/people");
    redirectWithNotice({
      redirectTo,
      intent: "success",
      notice: "Usuario eliminado.",
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

export async function revokePersonAccessAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/people");
  const personId = String(formData.get("personId") ?? "").trim();

  try {
    const ctx = await requireAccessManager();

    const personRows = await db
      .select({
        id: peopleTable.id,
        email: peopleTable.email,
        full_name: peopleTable.fullName,
      })
      .from(peopleTable)
      .where(eq(peopleTable.id, personId))
      .limit(1);

    const person = personRows[0];

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

    revalidatePath("/people");
    redirectWithNotice({
      redirectTo,
      intent: "success",
      notice: "Acceso a la plataforma revocado.",
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

export async function grantPersonAccessAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/people");
  const personId = String(formData.get("personId") ?? "").trim();
  const requestedAccessRole = normalizeAccessTier(
    String(formData.get("accessRole") ?? "collaborator"),
  );

  try {
    const ctx = await requireAccessManager();
    // Productores can only mint Externo logins; downgrade higher tiers.
    const accessRole: AccessTierRole = canManageAccessTier(
      ctx.role,
      requestedAccessRole,
    )
      ? requestedAccessRole
      : "collaborator";

    const personRows = await db
      .select({
        id: peopleTable.id,
        email: peopleTable.email,
        full_name: peopleTable.fullName,
      })
      .from(peopleTable)
      .where(eq(peopleTable.id, personId))
      .limit(1);

    const person = personRows[0];

    if (!person) {
      throw new Error("No se encontró el usuario.");
    }

    if (!person.email) {
      throw new Error(
        "Primero debes guardar un correo electrónico para poder gestionar acceso.",
      );
    }

    const { emailSent } = await grantPlatformAccess({
      email: person.email,
      fullName: person.full_name,
      role: accessRole,
    });

    revalidatePath("/people");
    redirectWithNotice({
      redirectTo,
      intent: "success",
      notice: emailSent
        ? "Acceso a la plataforma habilitado y correo enviado."
        : "Acceso a la plataforma habilitado.",
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

export async function togglePersonActiveAction(formData: FormData) {
  const ctx = await requireEditor();

  const personId = String(formData.get("personId") ?? "").trim();
  const nextActive = String(formData.get("active") ?? "") === "on";

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
