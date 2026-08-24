"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal, useFormStatus } from "react-dom";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  MailX,
  Minus,
  Pencil,
  Plus,
  ShieldCheck,
  Shuffle,
  X,
} from "lucide-react";

import {
  previewPeopleSyncAction,
  syncPeopleAction,
} from "@/app/actions/people-sync";
import { PeopleRedirectToInput } from "@/components/people/people-redirect-to";
import type { PeopleSyncPreview } from "@/lib/people/sync-preview";
import { ensureErrorMessage } from "@/lib/utils";

// Sentinel for "this is not any of the clubs we suggested".
const NEW_TEAM_CHOICE = "__new__";

function ConfirmButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--accent)] px-6 text-[12px] font-bold uppercase tracking-[0.18em] text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Sincronizando..." : "Confirmar"}
    </button>
  );
}

function PreviewGroup({
  title,
  tone,
  icon,
  items,
}: {
  title: string;
  tone: "add" | "edit" | "remove" | "keep";
  icon: React.ReactNode;
  items: { key: string; label: string; detail?: string }[];
}) {
  if (!items.length) {
    return null;
  }

  const toneClass = {
    add: "border-[rgba(22,140,90,0.28)] bg-[rgba(22,140,90,0.06)] text-[#0f7a4f]",
    edit: "border-[var(--border)] bg-[var(--background-soft)] text-[var(--foreground)]",
    remove: "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)]",
    keep: "border-[var(--border)] bg-[var(--background-soft)] text-[var(--muted)]",
  }[tone];

  return (
    <section className={`rounded-[var(--panel-radius)] border px-4 py-4 ${toneClass}`}>
      <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em]">
        {icon}
        {title} ({items.length})
      </p>
      <ul className="mt-3 space-y-1.5">
        {items.map((item) => (
          <li key={item.key} className="text-sm font-semibold leading-snug">
            {item.label}
            {item.detail ? (
              <span className="ml-2 text-xs font-medium opacity-70">
                {item.detail}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}


// Names from the "Listas" tab the portal does not know. Unambiguous ones are
// created; the look-alikes wait on an explicit answer, because "Atlético Pilar"
// next to "Club Atlético Pilar" is either a second club or the same one and the
// sheet cannot say which.
function TeamsGroup({
  teams,
  decisions,
  onDecide,
}: {
  teams: PeopleSyncPreview["teams"];
  decisions: Record<string, string>;
  onDecide: (name: string, value: string) => void;
}) {
  if (!teams.created.length && !teams.ambiguous.length) {
    return null;
  }

  return (
    <section className="rounded-[var(--panel-radius)] border border-[rgba(22,140,90,0.28)] bg-[rgba(22,140,90,0.06)] px-4 py-4 text-[#0f7a4f]">
      <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em]">
        <Plus className="size-3.5" />
        Equipos nuevos en Listas (
        {teams.created.length + teams.ambiguous.length})
      </p>

      {teams.created.length ? (
        <ul className="mt-3 space-y-1.5">
          {teams.created.map((name) => (
            <li key={`team-${name}`} className="text-sm font-semibold leading-snug">
              {name}
            </li>
          ))}
        </ul>
      ) : null}

      {teams.ambiguous.length ? (
        <div className="mt-4 space-y-3">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em]">
            <Shuffle className="size-3.5" />
            ¿Son el mismo equipo?
          </p>
          {teams.ambiguous.map((item) => (
            <div
              key={`amb-${item.name}`}
              className="rounded-[var(--panel-radius)] border border-[rgba(22,140,90,0.28)] bg-[var(--surface)] px-3 py-3"
            >
              <p className="text-sm font-bold text-[var(--foreground)]">{item.name}</p>
              <div className="mt-2 space-y-1.5">
                {item.candidates.map((candidate) => (
                  <label
                    key={`${item.name}-${candidate.clubId}`}
                    className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]"
                  >
                    <input
                      type="radio"
                      name={`team-${item.name}`}
                      checked={decisions[item.name] === candidate.clubId}
                      onChange={() => onDecide(item.name, candidate.clubId)}
                    />
                    Es el mismo que <strong>{candidate.name}</strong>
                  </label>
                ))}
                <label className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
                  <input
                    type="radio"
                    name={`team-${item.name}`}
                    checked={decisions[item.name] === NEW_TEAM_CHOICE}
                    onChange={() => onDecide(item.name, NEW_TEAM_CHOICE)}
                  />
                  Es un equipo nuevo
                </label>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <Link
        href="/teams"
        className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold underline"
      >
        Después completá sus datos en /teams
        <ArrowUpRight className="size-3.5" />
      </Link>
    </section>
  );
}

export function PeopleSyncModal({
  title,
  triggerClassName,
  children,
}: {
  title: string;
  triggerClassName: string;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [preview, setPreview] = useState<PeopleSyncPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // name -> clubId of the club it duplicates, or NEW_TEAM_CHOICE.
  const [teamDecisions, setTeamDecisions] = useState<Record<string, string>>({});

  // SSR-safe portal gate: document is only available after client mount.
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  async function loadPreview() {
    setIsLoading(true);
    setError(null);

    try {
      const next = await previewPeopleSyncAction();
      setTeamDecisions({});
      setPreview(next);
    } catch (caught) {
      setError(ensureErrorMessage(caught));
    } finally {
      setIsLoading(false);
    }
  }

  function openModal() {
    setIsOpen(true);
    setPreview(null);
    setTeamDecisions({});
    void loadPreview();
  }

  const ambiguousTeams = preview?.teams.ambiguous ?? [];
  const pendingAmbiguous = ambiguousTeams.filter(
    (item) => !teamDecisions[item.name],
  ).length;

  const hasChanges = Boolean(
    preview &&
      (preview.created.length ||
        preview.updated.length ||
        preview.deleted.length ||
        preview.teams.created.length ||
        ambiguousTeams.length),
  );

  // Exactly what was resolved on screen: the approved new names plus the
  // look-alikes the operator merged into an existing club.
  const decisionsPayload = JSON.stringify({
    create: [
      ...(preview?.teams.created ?? []),
      ...ambiguousTeams
        .filter((item) => teamDecisions[item.name] === NEW_TEAM_CHOICE)
        .map((item) => item.name),
    ],
    aliases: ambiguousTeams
      .filter(
        (item) =>
          teamDecisions[item.name] && teamDecisions[item.name] !== NEW_TEAM_CHOICE,
      )
      .map((item) => ({ alias: item.name, clubId: teamDecisions[item.name] })),
  });

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label={title}
        title={title}
        className={triggerClassName}
      >
        {children}
      </button>

      {isOpen && isMounted
        ? createPortal(
            <div className="fixed inset-0 z-[300] flex items-start justify-center bg-[rgba(28,13,16,0.48)] px-4 py-8 backdrop-blur-sm">
              <div
                className="absolute inset-0"
                aria-hidden="true"
                onClick={() => setIsOpen(false)}
              />
              <div className="relative z-[1] flex max-h-[calc(100vh-4rem)] w-full max-w-[640px] flex-col overflow-hidden rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lift)]">
                <div className="flex items-start justify-between gap-6 border-b border-[var(--border)] px-7 py-6">
                  <div className="min-w-0 space-y-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--n-400)]">
                      Sincronizar contactos
                    </p>
                    <h2 className="truncate text-xl font-extrabold tracking-tight text-[var(--foreground)]">
                      Esto va a cambiar en Personas
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="inline-flex size-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background-soft)] text-[var(--muted)] transition hover:text-[var(--foreground)]"
                    onClick={() => setIsOpen(false)}
                    aria-label="Cerrar"
                  >
                    <X className="size-4.5" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
                  {isLoading ? (
                    <div className="space-y-3">
                      {[0, 1, 2].map((key) => (
                        <div
                          key={key}
                          className="h-[72px] animate-pulse rounded-[var(--panel-radius)] bg-[var(--background-soft)]"
                        />
                      ))}
                    </div>
                  ) : error ? (
                    <div className="space-y-4 rounded-[var(--panel-radius)] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-5 py-5 text-sm font-semibold text-[var(--accent-strong)]">
                      <p>{error}</p>
                      <button
                        type="button"
                        onClick={() => void loadPreview()}
                        className="inline-flex items-center rounded-full border border-[var(--accent-border)] bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-strong)] transition hover:brightness-105"
                      >
                        Reintentar
                      </button>
                    </div>
                  ) : preview ? (
                    <>
                      <TeamsGroup
                        teams={preview.teams}
                        decisions={teamDecisions}
                        onDecide={(name, value) =>
                          setTeamDecisions((current) => ({
                            ...current,
                            [name]: value,
                          }))
                        }
                      />
                      {preview.teamsError ? (
                        <p className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3 text-xs font-semibold text-[var(--muted)]">
                          No se pudo leer la pestaña Listas, no se revisaron
                          equipos: {preview.teamsError}
                        </p>
                      ) : null}

                      <PreviewGroup
                        title="Se eliminan"
                        tone="remove"
                        icon={<Minus className="size-3.5" />}
                        items={preview.deleted.map((name) => ({
                          key: `del-${name}`,
                          label: name,
                          detail: "pierde el acceso a la plataforma",
                        }))}
                      />
                      <PreviewGroup
                        title="Se agregan"
                        tone="add"
                        icon={<Plus className="size-3.5" />}
                        items={preview.created.map((name) => ({
                          key: `new-${name}`,
                          label: name,
                        }))}
                      />
                      <PreviewGroup
                        title="Se actualizan"
                        tone="edit"
                        icon={<Pencil className="size-3.5" />}
                        items={preview.updated.map((item) => ({
                          key: `upd-${item.name}`,
                          label: item.name,
                          detail: item.restored
                            ? "se restaura"
                            : item.changes.join(", "),
                        }))}
                      />
                      <PreviewGroup
                        title="No se tocan (internos)"
                        tone="keep"
                        icon={<ShieldCheck className="size-3.5" />}
                        items={preview.protected.map((name) => ({
                          key: `keep-${name}`,
                          label: name,
                          detail: "@basquetpass.tv, solo se elimina desde el portal",
                        }))}
                      />
                      <PreviewGroup
                        title="Filas sin correo (no se sincronizan)"
                        tone="keep"
                        icon={<MailX className="size-3.5" />}
                        items={preview.skippedNoEmail.map((name) => ({
                          key: `norow-${name}`,
                          label: name,
                          detail: "cargá el correo en la planilla",
                        }))}
                      />
                      <PreviewGroup
                        title="No se tocan (sin correo)"
                        tone="keep"
                        icon={<MailX className="size-3.5" />}
                        items={preview.withoutEmail.map((name) => ({
                          key: `noemail-${name}`,
                          label: name,
                          detail: "sin correo, la planilla no lo elimina",
                        }))}
                      />

                      {preview.skippedNoEmail.length || preview.withoutEmail.length ? (
                        <p className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3 text-xs font-semibold leading-relaxed text-[var(--muted)]">
                          El correo es lo que vincula un contacto con la planilla:
                          las filas sin correo no se sincronizan, y las personas
                          del portal sin correo nunca se eliminan desde acá (solo
                          desde Personas).
                        </p>
                      ) : null}

                      {!hasChanges ? (
                        <p className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-5 py-5 text-sm font-semibold text-[var(--muted)]">
                          La planilla ya coincide con el portal: no hay cambios que
                          aplicar.
                        </p>
                      ) : null}

                      <p className="text-xs font-semibold text-[var(--muted)]">
                        {preview.unchanged} sin cambios
                        {preview.skippedRows
                          ? ` · ${preview.skippedRows} filas descartadas`
                          : ""}
                      </p>

                      {preview.warnings.length ? (
                        <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-4">
                          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--n-500)]">
                            <AlertTriangle className="size-3.5" />
                            Avisos ({preview.warnings.length})
                          </p>
                          <ul className="mt-3 space-y-1.5">
                            {preview.warnings.map((warning) => (
                              <li
                                key={warning}
                                className="text-xs font-medium leading-snug text-[var(--muted)]"
                              >
                                {warning}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>

                <form
                  action={syncPeopleAction}
                  className="flex items-center justify-end gap-3 border-t border-[var(--border)] px-7 py-5"
                >
                  <PeopleRedirectToInput />
                  <input
                    type="hidden"
                    name="teamDecisions"
                    value={decisionsPayload}
                  />
                  {pendingAmbiguous ? (
                    <p className="mr-auto text-xs font-semibold text-[var(--muted)]">
                      Resolvé {pendingAmbiguous}{" "}
                      {pendingAmbiguous === 1 ? "nombre" : "nombres"} para
                      continuar.
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background-soft)] px-6 text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--muted)] transition hover:text-[var(--foreground)]"
                  >
                    Cancelar
                  </button>
                  <ConfirmButton disabled={!hasChanges || pendingAmbiguous > 0} />
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
