import { headers } from "next/headers";
import { ArrowLeft, History, KeyRound, UserPlus } from "lucide-react";

import {
  banIdentityAction,
  createIdentityAction,
  revokeSessionsAction,
  setSuperAdminAction,
  unbanIdentityAction,
} from "@/app/actions/usuarios";
import { AppRoleCell } from "@/components/usuarios/app-role-cell";
import { ConfirmActionButton } from "@/components/usuarios/confirm-action-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageMessage } from "@/components/ui/page-message";
import { SectionTableCard } from "@/components/ui/section-table-card";
import { SubmitButton } from "@/components/ui/submit-button";
import { PORTAL_APP } from "@/lib/acceso/portal";
import { buildApexUrl } from "@/lib/constants";
import { formatMatchDate } from "@/lib/date";
import { getRoleDisplayName } from "@/lib/display";
import { parseNotice } from "@/lib/search-params";
import {
  getRoleCatalog,
  listRecentIdentityEvents,
  listUsuarios,
  type UsuarioRow,
} from "@/lib/usuarios/matrix";
import { requireSuperAdmin } from "@/lib/usuarios/guard";
import { cn } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const EVENT_LABELS: Record<string, string> = {
  "identity.create": "creó la identidad de",
  "identity.ban": "bloqueó a",
  "identity.unban": "desbloqueó a",
  "identity.revoke-sessions": "cerró las sesiones de",
  "superadmin.set": "hizo super admin a",
  "superadmin.unset": "quitó el super admin a",
};

function formatDay(date: Date) {
  return formatMatchDate(date.toISOString(), undefined, "d MMM yyyy");
}

// Usuarios (ADR 0010): every identity × every app of the catalog, and the
// account controls. Apex only, super admins only; requireSuperAdmin repeats
// both checks in every action.
export default async function UsuariosPage({ searchParams }: PageProps) {
  const actor = await requireSuperAdmin();
  const [resolvedSearchParams, apps, rows, events, host] = await Promise.all([
    searchParams,
    getRoleCatalog(),
    listUsuarios(),
    listRecentIdentityEvents(),
    headers().then((requestHeaders) => requestHeaders.get("host") ?? ""),
  ]);
  const { intent, notice } = parseNotice(resolvedSearchParams);
  // Deep link from a person's Cuenta block in Personal.
  const highlightedEmail =
    typeof resolvedSearchParams.email === "string"
      ? resolvedSearchParams.email.toLowerCase()
      : null;
  const namesById = new Map(rows.map((row) => [row.userId, row.name || row.email]));
  const nameOf = (userId: string | null) =>
    userId ? (namesById.get(userId) ?? "identidad borrada") : "script";
  const launcherUrl = buildApexUrl(host) ?? "/";

  return (
    <main className="mx-auto w-full max-w-[96rem] space-y-8 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-6">
        <div>
          <a
            href={launcherUrl}
            className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--n-500)] hover:text-[var(--accent)]"
          >
            <ArrowLeft className="size-4" />
            Aplicaciones
          </a>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--foreground)]">
            Usuarios
          </h1>
          <p className="mt-1 text-[var(--muted)]">
            Quién entra a cada app y con qué rol. Los cambios valen desde el
            próximo pedido de la persona en esa app.
          </p>
        </div>
        <span className="text-sm text-[var(--muted)]">{actor.email}</span>
      </header>

      <PageMessage intent={intent} message={notice} />

      <SectionTableCard title="Crear identidad" icon={UserPlus}>
        <form
          action={createIdentityAction}
          className="flex flex-col gap-3 p-6 sm:flex-row sm:items-end"
        >
          <label className="flex-1 space-y-1 text-sm font-semibold">
            <span>Correo</span>
            <Input name="email" type="email" required placeholder="persona@ejemplo.com" />
          </label>
          <label className="flex-1 space-y-1 text-sm font-semibold">
            <span>Nombre</span>
            <Input name="name" required placeholder="Nombre y apellido" />
          </label>
          <SubmitButton pendingLabel="Creando…" className="h-12">
            Crear
          </SubmitButton>
        </form>
        <p className="px-6 pb-6 text-xs text-[var(--n-500)]">
          No se envía ningún correo. La persona entra después con su enlace o
          con Google y queda en esta identidad.
        </p>
      </SectionTableCard>

      <SectionTableCard
        title="Identidades y apps"
        icon={KeyRound}
        badge={<Badge>{rows.length} identidades</Badge>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[80rem] text-sm">
            <thead className="bg-[var(--n-50)] text-left text-[11px] font-black uppercase tracking-[0.18em] text-[var(--n-500)]">
              <tr>
                <th className="px-6 py-4 align-top">Identidad</th>
                {apps.map((app) => (
                  <th key={app.key} className="px-4 py-4 align-top">
                    <div>{app.label}</div>
                    <ul className="mt-1 max-w-[14rem] space-y-0.5 text-[11px] font-medium normal-case tracking-normal text-[var(--n-500)]">
                      {app.roles.map((role) => (
                        <li key={role.key}>
                          <span className="font-bold">{role.label}</span>
                          {role.description ? `: ${role.description}` : null}
                        </li>
                      ))}
                    </ul>
                  </th>
                ))}
                <th className="px-4 py-4 align-top">Cuenta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--n-100)]">
              {rows.map((row) => {
                const locked = row.superAdmin && !row.banned;
                return (
                  <tr
                    key={row.userId}
                    className={cn(
                      "align-top",
                      highlightedEmail === row.email.toLowerCase() &&
                        "bg-[var(--accent-soft)]",
                    )}
                  >
                    <td className="px-6 py-4">
                      <div className="font-semibold text-[var(--foreground)]">
                        {row.name || row.email}
                      </div>
                      <div className="text-xs text-[var(--n-500)]">{row.email}</div>
                      <IdentityBadges row={row} />
                    </td>
                    {apps.map((app) => {
                      if (locked) {
                        return (
                          <td key={app.key} className="px-4 py-4">
                            <span className="inline-flex h-10 items-center font-semibold text-[var(--n-600)]">
                              Admin (super admin)
                            </span>
                          </td>
                        );
                      }

                      const acceso = row.accesos[app.key];
                      // Until basket#189 a Cuenta without a portal row still
                      // enters with its profiles.role; show that, not "Sin acceso".
                      const inherited =
                        app.key === PORTAL_APP && !acceso && row.cuenta
                          ? row.cuenta.role
                          : null;

                      return (
                        <td key={app.key} className="px-4 py-4">
                          <AppRoleCell
                            userId={row.userId}
                            app={app.key}
                            appLabel={app.label}
                            roles={app.roles}
                            currentRole={acceso?.role ?? inherited}
                          />
                          {acceso ? (
                            <p className="mt-2 text-[11px] text-[var(--n-500)]">
                              {acceso.grantedBy
                                ? `Por ${nameOf(acceso.grantedBy)}`
                                : "Alta inicial"}{" "}
                              · {formatDay(acceso.grantedAt)}
                            </p>
                          ) : inherited ? (
                            <p className="mt-2 text-[11px] text-[var(--n-500)]">
                              Desde la Cuenta
                            </p>
                          ) : null}
                        </td>
                      );
                    })}
                    <td className="px-4 py-4">
                      <IdentityActions row={row} isSelf={row.userId === actor.userId} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionTableCard>

      <SectionTableCard title="Cambios de cuenta recientes" icon={History}>
        {events.length === 0 ? (
          <p className="p-6 text-sm text-[var(--n-500)]">Todavía no hay cambios.</p>
        ) : (
          <ul className="divide-y divide-[var(--n-100)] text-sm">
            {events.map((event) => (
              <li key={event.id} className="px-6 py-3">
                <span className="font-semibold">{nameOf(event.actorId)}</span>{" "}
                {EVENT_LABELS[event.action] ?? event.action}{" "}
                <span className="font-semibold">{nameOf(event.targetUserId)}</span>
                <span className="text-[var(--n-500)]"> · {formatDay(event.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionTableCard>
    </main>
  );
}

function IdentityBadges({ row }: { row: UsuarioRow }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {row.superAdmin ? <Badge>Super admin</Badge> : null}
      {row.banned ? <Badge>Bloqueado</Badge> : null}
      <Badge>
        {row.cuenta
          ? `Cuenta: ${getRoleDisplayName(row.cuenta.role)}`
          : "Sin cuenta en el portal"}
      </Badge>
      {row.cuenta?.fichaName ? <Badge>Ficha: {row.cuenta.fichaName}</Badge> : null}
    </div>
  );
}

function IdentityActions({ row, isSelf }: { row: UsuarioRow; isSelf: boolean }) {
  const who = row.name || row.email;
  const target = { userId: row.userId };

  return (
    <div className="flex flex-col items-start gap-1">
      <ConfirmActionButton
        action={revokeSessionsAction}
        fields={target}
        label="Cerrar sesiones"
        confirmMessage={`Vas a cerrar todas las sesiones de ${who} en todos sus dispositivos. ¿Continuar?`}
      />
      {isSelf ? null : row.banned ? (
        <ConfirmActionButton
          action={unbanIdentityAction}
          fields={target}
          label="Desbloquear"
          confirmMessage={`${who} va a poder volver a entrar a las apps donde tenga acceso. ¿Continuar?`}
        />
      ) : (
        <ConfirmActionButton
          action={banIdentityAction}
          fields={target}
          label="Bloquear"
          tone="danger"
          confirmMessage={`Vas a bloquear a ${who} en todas las apps y cerrar sus sesiones. ¿Continuar?`}
        />
      )}
      {row.superAdmin ? (
        <ConfirmActionButton
          action={setSuperAdminAction}
          fields={{ ...target, superAdmin: "false" }}
          label="Quitar super admin"
          tone="danger"
          confirmMessage={
            isSelf
              ? "Vas a quitarte el super admin y perder el acceso a esta sección. ¿Continuar?"
              : `${who} deja de ser admin en todas las apps; vuelven a valer sus roles por app. ¿Continuar?`
          }
        />
      ) : (
        <ConfirmActionButton
          action={setSuperAdminAction}
          fields={{ ...target, superAdmin: "true" }}
          label="Hacer super admin"
          confirmMessage={`${who} va a ser admin en todas las apps y va a poder gestionar esta sección. ¿Continuar?`}
        />
      )}
    </div>
  );
}
