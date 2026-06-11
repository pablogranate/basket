import { redirect } from "next/navigation";
import { ShieldAlert, Video } from "lucide-react";

import { getUserContext } from "@/lib/auth";
import { APP_NAME, getDefaultDashboardHrefForRole } from "@/lib/constants";

import { LogoutButtonClient } from "./logout-button-client";

export default async function NoAccessPage() {
  const context = await getUserContext();

  if (!context.userId) {
    redirect("/login");
  }

  if (context.hasAccess) {
    redirect(getDefaultDashboardHrefForRole(context.role));
  }

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
            <ShieldAlert className="size-7" />
          </div>

          <h1 className="text-[1.6rem] font-black leading-tight tracking-tight text-[var(--foreground)]">
            Sin acceso a la plataforma
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
            Tu cuenta está autenticada pero todavía no tiene permisos asignados.
            Pedile a un administrador que habilite tu acceso.
          </p>

          {context.email ? (
            <p className="mt-4 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3 text-sm font-medium text-[var(--foreground)]">
              {context.email}
            </p>
          ) : null}

          <div className="mt-6">
            <LogoutButtonClient />
          </div>
        </div>
      </div>
    </div>
  );
}
