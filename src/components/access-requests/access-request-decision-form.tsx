import {
  approveAccessRequestAction,
  rejectAccessRequestAction,
} from "@/app/actions/access-requests";
import { PhoneFieldClient } from "@/components/access-requests/phone-field-client";
import type { AccessRequestReviewItem } from "@/lib/access-requests/review-item";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";

const ACCESS_TIER_OPTIONS = [
  { value: "collaborator", label: "Externo" },
  { value: "editor", label: "Productor" },
  { value: "admin", label: "Admin" },
] as const;

export function AccessRequestDecisionForm({
  item,
  roleOptions,
  canSelectAccessTier,
}: {
  item: AccessRequestReviewItem;
  roleOptions: { id: string; name: string }[];
  canSelectAccessTier: boolean;
}) {
  const { request, target, linkedPerson, defaultRoleId } = item;
  // Pre-fill with the existing person's values where there is one; what the
  // applicant declared stays visible alongside (D-10).
  const defaultFullName = linkedPerson?.fullName ?? request.full_name;
  const defaultPhone = linkedPerson?.phone ?? request.phone;
  const suggestions = target.kind === "suggest" ? target.suggestions : [];

  return (
    <div className="space-y-4 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] p-4">
      <dl className="space-y-1 text-sm">
        <Row label="Declaró" value={`${request.full_name} · ${request.phone}`} />
        <Row label="Función" value={request.funcion} />
        {request.mensaje ? <Row label="Mensaje" value={request.mensaje} /> : null}
        <Row
          label="Destino"
          value={
            target.kind === "link" && linkedPerson
              ? `Vincular a ${linkedPerson.fullName} (ficha existente)`
              : target.kind === "suggest"
                ? "Crear ficha nueva — hay nombres parecidos"
                : "Crear ficha nueva"
          }
        />
      </dl>

      <form action={approveAccessRequestAction} className="space-y-3">
        <input type="hidden" name="requestId" value={request.id} />
        <input type="hidden" name="redirectTo" value="/grid" />
        {target.kind === "link" && linkedPerson ? (
          <input type="hidden" name="personId" value={linkedPerson.id} />
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-[var(--n-500)]">
              Nombre completo
            </span>
            <Input name="fullName" defaultValue={defaultFullName} required />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-[var(--n-500)]">
              Teléfono
            </span>
            <PhoneFieldClient name="phone" defaultValue={defaultPhone} />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-[var(--n-500)]">
              Rol en la grilla
            </span>
            <Select
              name="roleId"
              defaultValue={linkedPerson?.roleId ?? defaultRoleId ?? ""}
            >
              <option value="">Sin rol</option>
              {roleOptions.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-[var(--n-500)]">
              Nivel de acceso
            </span>
            {canSelectAccessTier ? (
              <Select name="accessRole" defaultValue="collaborator">
                {ACCESS_TIER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            ) : (
              <>
                <input type="hidden" name="accessRole" value="collaborator" />
                <p className="px-1 py-3 text-sm text-[var(--n-500)]">
                  Externo (solo un admin puede dar un nivel mayor)
                </p>
              </>
            )}
          </label>
        </div>

        {suggestions.length ? (
          <fieldset className="space-y-2 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] p-3">
            <legend className="px-1 text-xs font-black uppercase tracking-[0.16em] text-[var(--n-500)]">
              Nombres parecidos ya cargados
            </legend>
            <p className="text-xs text-[var(--n-500)]">
              Si es la misma persona, elegí fusionar: su historial de grilla pasa
              a la ficha nueva y la vieja queda archivada.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="mergePersonId"
                value=""
                defaultChecked
              />
              <span>No fusionar</span>
            </label>
            {suggestions.map((suggestion) => (
              <label
                key={suggestion.id}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="radio"
                  name="mergePersonId"
                  value={suggestion.id}
                />
                <span>
                  Fusionar con {suggestion.fullName}
                  {suggestion.email ? ` · ${suggestion.email}` : ""}
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <SubmitButton pendingLabel="Aprobando...">Aprobar</SubmitButton>
        </div>
      </form>

      <form action={rejectAccessRequestAction}>
        <input type="hidden" name="requestId" value={request.id} />
        <input type="hidden" name="redirectTo" value="/grid" />
        <SubmitButton variant="ghost" pendingLabel="Rechazando...">
          Rechazar
        </SubmitButton>
      </form>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-xs font-black uppercase tracking-[0.14em] text-[var(--n-500)]">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-[var(--foreground)]">{value}</dd>
    </div>
  );
}
