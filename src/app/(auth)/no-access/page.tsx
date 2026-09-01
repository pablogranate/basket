import { redirect } from "next/navigation";
import { Clock3, ShieldAlert, Video } from "lucide-react";

import { AccessRequestForm } from "@/components/access-requests/access-request-form";
import { PageMessage } from "@/components/ui/page-message";
import { getUserContext } from "@/lib/auth";
import { APP_NAME, getDefaultDashboardHrefForRole } from "@/lib/constants";
import { getAccessRequestForOwnUser } from "@/lib/data/access-requests";
import { parseNotice } from "@/lib/search-params";

import { LogoutButtonClient } from "./logout-button-client";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NoAccessPage({ searchParams }: PageProps) {
  const context = await getUserContext();

  if (!context.userId) {
    redirect("/login");
  }

  if (context.hasAccess) {
    redirect(getDefaultDashboardHrefForRole(context.role));
  }

  const { intent, notice } = parseNotice(await searchParams);
  const request = await getAccessRequestForOwnUser(context);
  // Only a pending row is a pending request. A resolved one (approved access
  // later revoked, or rejected) means the applicant is back at the start and
  // gets the form again — a resolved request must never read as "in review",
  // which is how a revoked user ended up staring at a screen no approver saw.
  const isPending = request?.status === "pendiente";

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
            {isPending ? (
              <Clock3 className="size-7" />
            ) : (
              <ShieldAlert className="size-7" />
            )}
          </div>

          <h1 className="text-[1.6rem] font-black leading-tight tracking-tight text-[var(--foreground)]">
            {isPending ? "Solicitud en revisión" : "Pedí acceso a la plataforma"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
            {isPending
              ? "Un productor o admin tiene que aprobarla. Te avisamos por correo cuando esté lista."
              : "Completá tus datos y un productor o admin va a revisar tu solicitud."}
          </p>

          <div className="mt-5 text-left">
            <PageMessage intent={intent} message={notice} />
          </div>

          {isPending ? (
            <dl className="mt-5 space-y-2 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3 text-left text-sm">
              <PendingRow label="Nombre" value={request.full_name} />
              <PendingRow label="Correo" value={request.email} />
              <PendingRow label="Teléfono" value={request.phone} />
              <PendingRow label="Función" value={request.funcion} />
              {request.ciudad ? (
                <PendingRow label="Ciudad" value={request.ciudad} />
              ) : null}
              {request.mensaje ? (
                <PendingRow label="Mensaje" value={request.mensaje} />
              ) : null}
            </dl>
          ) : (
            <div className="mt-5">
              <AccessRequestForm email={context.email ?? ""} />
            </div>
          )}

          <div className="mt-6">
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
