import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Clock3, ShieldAlert, Video } from "lucide-react";

import { AccessRequestForm } from "@/components/access-requests/access-request-form";
import { PageMessage } from "@/components/ui/page-message";
import {
  getEffectiveAccess,
  listCatalogApps,
  listEffectiveAccessForUser,
} from "@/lib/acceso/accesos";
import {
  appSubdomain,
  launcherApps,
  requestAsksFuncion,
  resolveRequestApp,
} from "@/lib/acceso/catalog";
import { PORTAL_APP } from "@/lib/acceso/portal";
import { resolveNoAccessView } from "@/lib/access-requests/no-access";
import { getOwnAccessRequest } from "@/lib/access-requests/requests";
import { getUserContext } from "@/lib/auth";
import {
  APP_NAME,
  buildApexUrl,
  buildAppUrlFromAnyHost,
  getDefaultDashboardHrefForRole,
} from "@/lib/constants";
import { authDb } from "@/lib/db/auth-client";
import { parseNotice } from "@/lib/search-params";

import { LogoutButtonClient } from "./logout-button-client";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// The Solicitud form for every app (the portal is the only auth server, ADR
// 0009). `?app=` comes from the sibling that sent the person here; it only
// picks which Solicitud to show or file, never what anyone may enter.
export default async function NoAccessPage({ searchParams }: PageProps) {
  const context = await getUserContext();

  if (!context.userId) {
    redirect("/login");
  }

  const resolvedSearchParams = await searchParams;
  const { intent, notice } = parseNotice(resolvedSearchParams);
  const catalog = await listCatalogApps();
  const app = resolveRequestApp(
    typeof resolvedSearchParams.app === "string" ? resolvedSearchParams.app : null,
    catalog.map((entry) => entry.key),
  );
  const appLabel = catalog.find((entry) => entry.key === app)?.label ?? app;
  const isPortal = app === PORTAL_APP;

  const [holdsApp, own, access] = await Promise.all([
    isPortal
      ? context.hasAccess
      : getEffectiveAccess(context.userId, app).then(Boolean),
    getOwnAccessRequest(authDb, { userId: context.userId, app }),
    listEffectiveAccessForUser(context.userId),
  ]);
  const view = resolveNoAccessView({ holdsApp, pending: own.pending });
  const host = (await headers()).get("host") ?? "";

  if (view === "forward") {
    redirect(
      isPortal
        ? getDefaultDashboardHrefForRole(context.role)
        : (buildAppUrlFromAnyHost(host, appSubdomain(app)) ?? "/"),
    );
  }

  const request = view === "pending" ? own.request : null;
  // Asking for one app never hides the others: the directory lists them.
  const holdsOtherApps = launcherApps({
    hasPortalAccess: context.hasAccess,
    apps: access.map((row) => row.app),
  }).some((held) => held !== app);
  const directoryUrl = holdsOtherApps ? buildApexUrl(host) : null;
  const deciders = isPortal ? "un productor o admin" : `un admin de ${appLabel}`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-6 py-8">
      <div className="w-full max-w-[440px]">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--foreground)] text-white">
            <Video className="size-5" />
          </div>
          <p className="text-xl font-extrabold tracking-tight text-[var(--foreground)]">
            {APP_NAME}
          </p>
        </div>

        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--surface)] p-7 text-center shadow-[0_12px_34px_rgba(28,13,16,0.05)] sm:p-8">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            {request ? (
              <Clock3 className="size-7" />
            ) : (
              <ShieldAlert className="size-7" />
            )}
          </div>

          <h1 className="text-[1.6rem] font-black leading-tight tracking-tight text-[var(--foreground)]">
            {request ? "Solicitud en revisión" : `Pedí acceso a ${appLabel}`}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
            {request
              ? `La tiene que aprobar ${deciders}. Te avisamos por correo cuando esté lista.`
              : `Completá tus datos y ${deciders} va a revisar tu solicitud.`}
          </p>

          <div className="mt-5 text-left">
            <PageMessage intent={intent} message={notice} />
          </div>

          {request ? (
            <dl className="mt-5 space-y-2 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3 text-left text-sm">
              <PendingRow label="Nombre" value={request.full_name} />
              <PendingRow label="Correo" value={request.email} />
              <PendingRow label="Teléfono" value={request.phone} />
              {request.funcion ? (
                <PendingRow label="Función" value={request.funcion} />
              ) : null}
              {request.ciudad ? (
                <PendingRow label="Ciudad" value={request.ciudad} />
              ) : null}
              {request.mensaje ? (
                <PendingRow label="Mensaje" value={request.mensaje} />
              ) : null}
            </dl>
          ) : (
            <div className="mt-5">
              <AccessRequestForm
                email={context.email ?? ""}
                app={app}
                asksFuncion={requestAsksFuncion(app)}
              />
            </div>
          )}

          <div className="mt-6 flex flex-col items-center gap-3">
            {directoryUrl ? (
              <a
                href={directoryUrl}
                className="text-sm font-semibold text-[var(--accent)] hover:underline"
              >
                Ir a mis aplicaciones
              </a>
            ) : null}
            <LogoutButtonClient />
          </div>
        </div>
      </div>
    </div>
  );
}

function PendingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-xs font-black uppercase tracking-[0.14em] text-[var(--n-500)]">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 font-medium text-[var(--foreground)]">
        {value}
      </dd>
    </div>
  );
}
