import { SectionPageHeader } from "@/components/layout/section-page-header";
import { LogsSectionTabs } from "@/components/notifications/logs-section-tabs";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth-access";
import { linkProfileToPersonAction } from "@/app/actions/access-requests";
import { restoreDuplicatePairAction } from "@/app/actions/people";
import { DuplicateFichaActions } from "@/components/people/duplicate-ficha-actions";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  listDecidedAccessRequests,
  listPendingAccessRequests,
  type AccessRequestSummary,
} from "@/lib/access-requests/requests";
import { PORTAL_APP } from "@/lib/acceso/portal";
import { authDb } from "@/lib/db/auth-client";
import { db } from "@/lib/db/client";
import { getDuplicateReview } from "@/lib/people/duplicates";
import { listProfileLinkReview } from "@/lib/people/identity";
import { formatMatchDateTime } from "@/lib/date";

export default async function AccessRequestsLogPage() {
  await requireAdmin();
  const [pending, decided, linkReview, duplicateReview] = await Promise.all([
    listPendingAccessRequests(authDb, { app: PORTAL_APP }),
    listDecidedAccessRequests(authDb, { app: PORTAL_APP }),
    listProfileLinkReview(db),
    getDuplicateReview(db),
  ]);
  const { pending: duplicates, dismissed } = duplicateReview;

  return (
    <div className="space-y-8">
      <SectionPageHeader
        title="Registros"
        description="Solicitudes de acceso: quién pidió entrar, con qué función, y quién aprobó o rechazó cada pedido."
      />
      <LogsSectionTabs active="requests" />

      <Card className="space-y-4">
        <h3 className="text-lg font-extrabold text-[var(--foreground)]">
          Pendientes ({pending.length})
        </h3>
        {pending.length ? (
          <RequestTable rows={pending} showDecision={false} />
        ) : (
          <p className="text-sm text-[var(--n-500)]">
            No hay solicitudes esperando decisión.
          </p>
        )}
      </Card>

      <Card className="space-y-4">
        <h3 className="text-lg font-extrabold text-[var(--foreground)]">
          Historial ({decided.length})
        </h3>
        {decided.length ? (
          <RequestTable rows={decided} showDecision />
        ) : (
          <p className="text-sm text-[var(--n-500)]">
            Todavía no se resolvió ninguna solicitud.
          </p>
        )}
      </Card>

      <Card className="space-y-4">
        <h3 className="text-lg font-extrabold text-[var(--foreground)]">
          Cuentas por vincular ({linkReview.length})
        </h3>
        <p className="text-sm text-[var(--n-500)]">
          La migración vincula cuentas y fichas solo por correo exacto. Estas
          quedaron sin vincular, pero hay una ficha con un nombre que parece ser
          la misma persona. Vincular es lo que hace que Mi jornada le muestre sus
          partidos.
        </p>
        {linkReview.length ? (
          <ul className="space-y-3">
            {linkReview.map((row) => (
              <li
                key={row.profile.id}
                className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3"
              >
                <p className="text-sm font-bold text-[var(--foreground)]">
                  {row.profile.full_name ?? "Sin nombre"}{" "}
                  <span className="font-medium text-[var(--n-500)]">
                    {row.profile.email}
                  </span>
                </p>
                <ul className="mt-2 space-y-2">
                  {row.candidates.map((candidate) => (
                    <li
                      key={candidate.id}
                      className="flex flex-wrap items-center gap-3 text-sm"
                    >
                      <span className="text-[var(--n-600)]">
                        {candidate.full_name}
                        {candidate.email ? ` · ${candidate.email}` : ""}
                      </span>
                      <form action={linkProfileToPersonAction}>
                        <input
                          type="hidden"
                          name="profileId"
                          value={row.profile.id}
                        />
                        <input
                          type="hidden"
                          name="personId"
                          value={candidate.id}
                        />
                        <SubmitButton
                          variant="ghost"
                          pendingLabel="Vinculando..."
                          className="h-9 px-3 text-xs"
                        >
                          Vincular
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--n-500)]">
            No quedan cuentas con una ficha parecida sin vincular.
          </p>
        )}
      </Card>

      <Card className="space-y-4">
        <h3 className="text-lg font-extrabold text-[var(--foreground)]">
          Posibles fichas duplicadas ({duplicates.length})
        </h3>
        <p className="text-sm text-[var(--n-500)]">
          Fichas con cuenta del portal y otra ficha sin cuenta con el mismo correo
          o un nombre parecido. Si la grilla carga a la persona con otro nombre,
          sus partidos quedan en la ficha sin cuenta y Mi jornada no se los
          muestra. Fusionar los pasa a la ficha con cuenta y archiva la otra.
        </p>
        {duplicates.length ? (
          <ul className="space-y-3">
            {duplicates.map((row) => (
              <li
                key={row.survivor.id}
                className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3"
              >
                <p className="text-sm font-bold text-[var(--foreground)]">
                  {row.survivor.fullName}{" "}
                  <span className="font-medium text-[var(--n-500)]">
                    {row.survivor.email ?? "sin correo"} · {row.survivor.assignmentCount}{" "}
                    partidos
                  </span>
                </p>
                <ul className="mt-2 space-y-2">
                  {row.duplicates.map((duplicate) => (
                    <li
                      key={duplicate.id}
                      className="flex flex-wrap items-center gap-3 text-sm"
                    >
                      <span className="text-[var(--n-600)]">
                        {duplicate.fullName}
                        {duplicate.email ? ` · ${duplicate.email}` : ""} ·{" "}
                        {duplicate.assignmentCount} partidos
                      </span>
                      <DuplicateFichaActions
                        survivor={row.survivor}
                        duplicate={duplicate}
                        redirectTo="/notifications/solicitudes"
                      />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--n-500)]">
            No hay fichas que parezcan duplicadas.
          </p>
        )}
        {dismissed.length ? (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-[var(--n-600)]">
              Marcadas como personas distintas ({dismissed.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {dismissed.map((row) => (
                <li
                  key={`${row.person.id}-${row.other.id}`}
                  className="flex flex-wrap items-center gap-3"
                >
                  <span className="text-[var(--n-600)]">
                    {row.person.fullName} · {row.other.fullName}
                  </span>
                  <form action={restoreDuplicatePairAction}>
                    <input type="hidden" name="personId" value={row.person.id} />
                    <input type="hidden" name="otherPersonId" value={row.other.id} />
                    <input
                      type="hidden"
                      name="redirectTo"
                      value="/notifications/solicitudes"
                    />
                    <SubmitButton
                      variant="ghost"
                      pendingLabel="Restaurando..."
                      className="h-9 px-3 text-xs"
                    >
                      Volver a sugerir
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Card>

    </div>
  );
}

function RequestTable({
  rows,
  showDecision,
}: {
  rows: AccessRequestSummary[];
  showDecision: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--n-500)]">
            <th className="py-2 pr-4">Nombre</th>
            <th className="py-2 pr-4">Correo</th>
            <th className="py-2 pr-4">Función</th>
            <th className="py-2 pr-4">Teléfono</th>
            <th className="py-2 pr-4">Ciudad</th>
            <th className="py-2 pr-4">Enviada</th>
            {showDecision ? (
              <>
                <th className="py-2 pr-4">Estado</th>
                <th className="py-2 pr-4">Decidió</th>
                <th className="py-2">Fecha</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="py-2 pr-4 font-semibold text-[var(--foreground)]">
                {row.full_name}
              </td>
              <td className="py-2 pr-4 text-[var(--n-600)]">{row.email}</td>
              <td className="py-2 pr-4 text-[var(--n-600)]">{row.funcion ?? "—"}</td>
              <td className="py-2 pr-4 text-[var(--n-600)]">{row.phone}</td>
              <td className="py-2 pr-4 text-[var(--n-600)]">{row.ciudad ?? "—"}</td>
              <td className="py-2 pr-4 text-[var(--n-500)]">
                {formatMatchDateTime(row.created_at)}
              </td>
              {showDecision ? (
                <>
                  <td className="py-2 pr-4 font-semibold text-[var(--foreground)]">
                    {row.status}
                  </td>
                  <td className="py-2 pr-4 text-[var(--n-600)]">
                    {row.decided_by_name ?? "—"}
                  </td>
                  <td className="py-2 text-[var(--n-500)]">
                    {row.decided_at ? formatMatchDateTime(row.decided_at) : "—"}
                  </td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
