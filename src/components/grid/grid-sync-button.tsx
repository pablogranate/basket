"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, RefreshCw, Trash2, UserPlus, X } from "lucide-react";
import { createPortal } from "react-dom";

import {
  previewGridSyncAction,
  syncGridAction,
  type GridSyncPreview,
} from "@/app/actions/grid-sync";
import { ensureErrorMessage } from "@/lib/utils";

const SKIP_REASON_LABELS: Record<string, string> = {
  tabs_missing:
    "No se van a eliminar partidos: hay pestañas del sheet que no se pudieron leer.",
  plan_errors:
    "No se van a eliminar partidos: la planilla tiene errores que hay que corregir primero.",
  candidates_unavailable:
    "No se van a eliminar partidos: no se pudieron leer los partidos existentes.",
};

function formatDeleteLabel(label: string) {
  const separatorIndex = label.lastIndexOf(" @ ");
  if (separatorIndex === -1) {
    return label;
  }
  const teams = label.slice(0, separatorIndex);
  const kickoff = new Date(label.slice(separatorIndex + 3));
  if (Number.isNaN(kickoff.getTime())) {
    return label;
  }
  const formatted = kickoff.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${teams} — ${formatted}`;
}

function ConfirmButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <RefreshCw className={pending ? "size-3.5 animate-spin" : "size-3.5"} />
      {pending ? "Sincronizando…" : "Sincronizar"}
    </button>
  );
}

function PreviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--n-400)]">
        {title}
      </p>
      {children}
    </div>
  );
}

type GridSyncButtonProps = {
  redirectTo: string;
  lastSyncedLabel?: string;
};

export function GridSyncButton({ redirectTo, lastSyncedLabel }: GridSyncButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<GridSyncPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const title = lastSyncedLabel
    ? `Sincronizar grilla (última: ${lastSyncedLabel})`
    : "Sincronizar grilla";

  async function openPreview() {
    setIsLoading(true);
    setPreview(null);
    setError(null);
    setIsOpen(true);

    try {
      const result = await previewGridSyncAction();
      setPreview(result);
    } catch (caught) {
      setError(ensureErrorMessage(caught));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openPreview()}
        disabled={isLoading}
        aria-label={isLoading ? "Preparando vista previa" : title}
        title={isLoading ? "Preparando vista previa" : title}
        className="inline-flex size-[52px] items-center justify-center rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)] shadow-[var(--shadow-rest)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw className={isLoading ? "size-4 animate-spin" : "size-4"} />
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
                      Vista previa
                    </p>
                    <h2 className="truncate text-xl font-extrabold tracking-tight text-[var(--foreground)]">
                      Confirmar sincronización
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

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
                  {isLoading ? (
                    <div className="space-y-3">
                      {[0, 1, 2].map((key) => (
                        <div
                          key={key}
                          className="h-[52px] animate-pulse rounded-[var(--panel-radius)] bg-[var(--background-soft)]"
                        />
                      ))}
                    </div>
                  ) : error ? (
                    <div className="rounded-[var(--panel-radius)] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-5 py-5 text-sm font-semibold text-[var(--accent-strong)]">
                      <p>{error}</p>
                    </div>
                  ) : preview ? (
                    <>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                          { label: "Creados", value: preview.creates },
                          { label: "Actualizados", value: preview.updates },
                          { label: "Sin cambios", value: preview.unchanged },
                          { label: "Eliminados", value: preview.deletes.length },
                        ].map((stat) => (
                          <div
                            key={stat.label}
                            className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3"
                          >
                            <p className="text-2xl font-extrabold tracking-tight text-[var(--foreground)]">
                              {stat.value}
                            </p>
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--n-400)]">
                              {stat.label}
                            </p>
                          </div>
                        ))}
                      </div>

                      {preview.assignmentUpserts || preview.assignmentDeletes ? (
                        <p className="text-sm text-[var(--muted)]">
                          Asignaciones: +{preview.assignmentUpserts}/-
                          {preview.assignmentDeletes}
                        </p>
                      ) : null}

                      {preview.deletes.length ? (
                        <PreviewSection title="Partidos que se van a eliminar">
                          <ul className="space-y-1.5">
                            {preview.deletes.map((item) => (
                              <li
                                key={item.id}
                                className="flex items-center gap-2 rounded-[var(--panel-radius)] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-strong)]"
                              >
                                <Trash2 className="size-3.5 shrink-0" />
                                <span className="min-w-0 truncate">
                                  {formatDeleteLabel(item.label)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </PreviewSection>
                      ) : preview.deletePassSkipped ? (
                        <p className="text-sm font-semibold text-[var(--muted)]">
                          {SKIP_REASON_LABELS[preview.deletePassSkipped] ??
                            "No se van a eliminar partidos en esta sincronización."}
                        </p>
                      ) : null}

                      {preview.peopleToCreate.length || preview.peopleToResurrect.length ? (
                        <PreviewSection title="Personas">
                          <ul className="space-y-1.5 text-sm text-[var(--foreground)]">
                            {preview.peopleToCreate.map((name) => (
                              <li key={`create-${name}`} className="flex items-center gap-2">
                                <UserPlus className="size-3.5 shrink-0 text-[var(--n-400)]" />
                                Se va a crear «{name}»
                              </li>
                            ))}
                            {preview.peopleToResurrect.map((name) => (
                              <li key={`resurrect-${name}`} className="flex items-center gap-2">
                                <UserPlus className="size-3.5 shrink-0 text-[var(--n-400)]" />
                                Se va a reactivar «{name}»
                              </li>
                            ))}
                          </ul>
                        </PreviewSection>
                      ) : null}

                      {preview.warnings.length ? (
                        <PreviewSection title="Avisos">
                          <ul className="space-y-1.5">
                            {preview.warnings.map((warning) => (
                              <li
                                key={warning}
                                className="flex items-start gap-2 text-sm font-medium text-[var(--foreground)]"
                              >
                                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                                <span>{warning}</span>
                              </li>
                            ))}
                          </ul>
                        </PreviewSection>
                      ) : null}

                      {preview.errors.length ? (
                        <PreviewSection title="Errores en la planilla">
                          <ul className="space-y-1.5">
                            {preview.errors.map((planError) => (
                              <li
                                key={planError}
                                className="rounded-[var(--panel-radius)] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-strong)]"
                              >
                                {planError}
                              </li>
                            ))}
                          </ul>
                        </PreviewSection>
                      ) : null}

                      <PreviewSection title="Pestañas">
                        <p className="text-sm text-[var(--muted)]">
                          Leídas: {preview.tabsSynced.length ? preview.tabsSynced.join(", ") : "ninguna"}
                          {preview.tabsMissing.length
                            ? ` · Sin leer: ${preview.tabsMissing.join(", ")}`
                            : ""}
                        </p>
                      </PreviewSection>
                    </>
                  ) : null}
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] px-7 py-5">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--background-soft)] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--n-600)] transition hover:text-[var(--foreground)]"
                  >
                    Cancelar
                  </button>
                  {preview ? (
                    <form action={syncGridAction}>
                      <input type="hidden" name="redirectTo" value={redirectTo} />
                      <ConfirmButton />
                    </form>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
