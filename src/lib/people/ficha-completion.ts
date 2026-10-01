import type { AppRole } from "@/lib/database.types";

// Who the portal asks to complete their ficha: a portal user whose Cuenta no
// ficha claims, typically granted the portal after joining through another
// app. Admins and super admins run the portal without appearing in the
// grilla, so they are never asked. A Cuenta whose name matches an unlinked
// ficha waits in the admins' "Cuentas por vincular" list instead: a name
// alone never links or merges (D-08), and a second ficha would duplicate
// the person.
export function shouldAskFichaCompletion({
  hasAccess,
  role,
  superAdmin,
  hasFicha,
  awaitingLinkReview,
}: {
  hasAccess: boolean;
  role: AppRole;
  superAdmin: boolean;
  hasFicha: boolean;
  awaitingLinkReview: boolean;
}): boolean {
  if (!hasAccess || role === "admin" || superAdmin) {
    return false;
  }

  return !hasFicha && !awaitingLinkReview;
}
