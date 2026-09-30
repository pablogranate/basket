import { REQUEST_DEFAULT_APP } from "@/lib/acceso/catalog";

// What /no-access?app=<key> shows for one app: someone who already holds the
// app is sent on to it, a pending Solicitud for it reads as "in review", and
// anyone else gets the form. Pending-ness is the lifecycle module's call
// (getOwnAccessRequest), never a status comparison here.
export type NoAccessView = "forward" | "pending" | "form";

export function resolveNoAccessView({
  holdsApp,
  pending,
}: {
  holdsApp: boolean;
  pending: boolean;
}): NoAccessView {
  if (holdsApp) {
    return "forward";
  }

  return pending ? "pending" : "form";
}

export function buildNoAccessPath(app: string): string {
  return app === REQUEST_DEFAULT_APP
    ? "/no-access"
    : `/no-access?app=${encodeURIComponent(app)}`;
}
