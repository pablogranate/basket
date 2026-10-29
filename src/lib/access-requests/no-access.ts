import { reportAuthEvent } from "@/lib/telemetry";

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
  return `/no-access?app=${encodeURIComponent(app)}`;
}

// A hit on /no-access is friction (basket-telemetry SPEC §11.5): report it
// with the app asked for and who asked, unless the person is sent on.
export function reportNoAccess({
  userId,
  app,
  view,
}: {
  userId: string;
  app: string;
  view: NoAccessView;
}): void {
  if (view === "forward") {
    return;
  }

  reportAuthEvent({ type: "no_access", userId, app, detail: { view } });
}
