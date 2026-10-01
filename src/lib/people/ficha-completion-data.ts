import "server-only";

import { eq } from "drizzle-orm";

import { resolveApprovalTarget } from "@/lib/access-requests/approval";
import {
  FUNCION_ROLE_NAME,
  isAccessRequestFuncion,
  type AccessRequestFuncion,
} from "@/lib/access-requests/constants";
import { getLatestOwnAccessRequest } from "@/lib/access-requests/requests";
import type { UserContext } from "@/lib/auth";
import { authDb } from "@/lib/db/auth-client";
import { db, type DbExecutor } from "@/lib/db/client";
import { people as peopleTable, roles as rolesTable } from "@/lib/db/schema";
import { shouldAskFichaCompletion } from "@/lib/people/ficha-completion";
import { listApprovalCandidates } from "@/lib/people/identity";
import { normalizeText } from "@/lib/utils";

export type FichaCompletionPrompt = {
  funcion: AccessRequestFuncion | null;
  phone: string | null;
  ciudad: string | null;
};

// The ficha modal's defaults for this user, or null when they are not asked.
// The cheap checks go first, so most requests stop at one indexed lookup; the
// candidate scan only runs for a Cuenta without a ficha.
export async function getFichaCompletionPrompt(
  user: UserContext,
): Promise<FichaCompletionPrompt | null> {
  const { userId, profileId, email } = user;
  const subject = {
    hasAccess: user.hasAccess,
    role: user.role,
    superAdmin: user.superAdmin,
  };

  if (
    !userId ||
    !profileId ||
    !email ||
    !shouldAskFichaCompletion({ ...subject, hasFicha: false, awaitingLinkReview: false })
  ) {
    return null;
  }

  try {
    const [ficha] = await db
      .select({ id: peopleTable.id })
      .from(peopleTable)
      .where(eq(peopleTable.profileId, profileId))
      .limit(1);

    if (ficha) {
      return null;
    }

    const target = resolveApprovalTarget({
      email,
      fullName: user.profile?.full_name ?? "",
      candidates: await listApprovalCandidates(db),
    });

    if (
      !shouldAskFichaCompletion({
        ...subject,
        hasFicha: false,
        awaitingLinkReview: target.kind === "suggest",
      })
    ) {
      return null;
    }

    const latest = await getLatestOwnAccessRequest(authDb, { userId });

    return {
      funcion:
        latest?.funcion && isAccessRequestFuncion(latest.funcion)
          ? latest.funcion
          : null,
      phone: latest?.phone ?? null,
      ciudad: latest?.ciudad ?? null,
    };
  } catch (error) {
    // The modal is a nudge: a failed read skips it rather than the page.
    console.error("[acceso] failed to resolve the ficha completion", error);
    return null;
  }
}

// The grilla role a declared función defaults to, as the approve modal does.
// Null when the roles table no longer has it: the ficha is still created.
export async function resolveFuncionRoleId(
  exec: DbExecutor,
  funcion: AccessRequestFuncion,
): Promise<string | null> {
  const wanted = normalizeText(FUNCION_ROLE_NAME[funcion]);
  const rows = await exec
    .select({ id: rolesTable.id, name: rolesTable.name })
    .from(rolesTable)
    .where(eq(rolesTable.active, true));

  return rows.find((row) => normalizeText(row.name) === wanted)?.id ?? null;
}
