import { createMatchAction } from "@/app/actions/matches";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { ALL_CLUB_OPTIONS, CLUB_COMPETITIONS } from "@/lib/club-catalog";
import {
  DEFAULT_TIMEZONE,
  MATCH_STATUS_OPTIONS,
  PRODUCTION_MODE_OPTIONS,
} from "@/lib/constants";
import { getDateInputValue } from "@/lib/date";
import type { PersonRow } from "@/lib/database.types";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

export function CreateMatchForm({
  owners,
  redirectTo,
  canEdit,
  className,
}: {
  owners: Pick<PersonRow, "id" | "full_name">[];
  redirectTo: string;
  canEdit: boolean;
  className?: string;
}) {
  const fieldClassName =
    "h-11 rounded-[14px] border-[var(--border)] bg-[var(--n-50)] px-3.5 text-[14px] font-medium text-[var(--foreground)] placeholder:text-[var(--muted)] focus:bg-white";

  return (
    <Card
      className={cn(
        "panel-surface flex flex-col overflow-hidden border border-[var(--border)] p-0",
        className,
      )}
    >
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
            <Plus className="size-4" />
          </div>
          <div>
            <h2 className="text-[28px] font-extrabold leading-none tracking-tight text-[var(--foreground)]">
              Alta Rápida
            </h2>
            <p className="mt-1 text-sm font-medium text-[var(--muted)]">
              Nuevo partido / evento
            </p>
          </div>
        </div>
        <div className="mt-5 h-px bg-[var(--border)]" />
      </div>

      <form action={createMatchAction} className="flex flex-1 flex-col">
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <input type="hidden" name="timezone" value={DEFAULT_TIMEZONE} />

        <div className="flex-1 space-y-4 px-5 pb-5">
          <label className="space-y-2">
            <span className="text-sm font-bold text-[var(--foreground)]">
              Liga / Competencia
            </span>
            <Input
              name="competition"
              list="competition-catalog"
              placeholder="Liga Nacional"
              disabled={!canEdit}
              className={fieldClassName}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-bold text-[var(--foreground)]">
                Local
              </span>
              <Input
                name="homeTeam"
                list="club-catalog"
                required
                disabled={!canEdit}
                placeholder="Equipo local"
                className={fieldClassName}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold text-[var(--foreground)]">
                Visitante
              </span>
              <Input
                name="awayTeam"
                list="club-catalog"
                required
                disabled={!canEdit}
                placeholder="Equipo visitante"
                className={fieldClassName}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-bold text-[var(--foreground)]">
                Fecha
              </span>
              <Input
                type="date"
                name="date"
                defaultValue={getDateInputValue()}
                required
                disabled={!canEdit}
                className={fieldClassName}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold text-[var(--foreground)]">
                Hora inicio
              </span>
              <Input
                type="time"
                name="time"
                defaultValue="19:00"
                required
                disabled={!canEdit}
                className={fieldClassName}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-bold text-[var(--foreground)]">
                Producción
              </span>
              <Select
                name="productionMode"
                disabled={!canEdit}
                className={fieldClassName}
                defaultValue=""
              >
                <option value="">Selecciona un modo</option>
                {PRODUCTION_MODE_OPTIONS.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold text-[var(--foreground)]">
                Estado
              </span>
              <Select name="status" disabled={!canEdit} className={fieldClassName}>
                {MATCH_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-bold text-[var(--foreground)]">
                Responsable de cancha
              </span>
              <Select name="ownerId" disabled={!canEdit} className={fieldClassName}>
                <option value="">Sin responsable</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.full_name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold text-[var(--foreground)]">
                Duración
              </span>
              <Input
                type="number"
                name="durationMinutes"
                min={30}
                defaultValue={150}
                disabled={!canEdit}
                className={fieldClassName}
              />
            </label>
          </div>

          <label className="space-y-2">
            <span className="text-sm font-bold text-[var(--foreground)]">
              Sede
            </span>
            <Input
              name="venue"
              placeholder="Estadio / remoto"
              disabled={!canEdit}
              className={fieldClassName}
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-bold text-[var(--foreground)]">
              Observaciones
            </span>
            <Textarea
              name="notes"
              disabled={!canEdit}
              placeholder="Notas operativas, técnicas o contexto editorial"
              className="min-h-[110px] rounded-[16px] border-[var(--border)] bg-[var(--n-50)] px-3.5 py-3 text-[14px] font-medium text-[var(--foreground)] placeholder:text-[var(--muted)] focus:bg-white"
            />
          </label>

          <datalist id="competition-catalog">
            {CLUB_COMPETITIONS.map((competition) => (
              <option key={competition} value={competition} />
            ))}
          </datalist>
          <datalist id="club-catalog">
            {ALL_CLUB_OPTIONS.map((club) => (
              <option key={club} value={club} />
            ))}
          </datalist>
        </div>

        <div className="border-t border-[var(--border)] px-5 pb-5 pt-4">
          {canEdit ? (
            <SubmitButton
              pendingLabel="Creando..."
              className="h-12 w-full rounded-[14px] text-[15px] font-extrabold"
            >
              Crear partido
            </SubmitButton>
          ) : (
            <Button variant="secondary" disabled className="h-12 w-full rounded-[14px]">
              Solo lectura
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
