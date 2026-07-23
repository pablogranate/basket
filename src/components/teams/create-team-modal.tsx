"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ImagePlus, Pencil, Plus, Save, Shield, Trash2, X } from "lucide-react";

import { upsertTeamAction } from "@/app/actions/teams";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CLUB_COMPETITIONS } from "@/lib/club-catalog";
import type { TeamDirectoryItem } from "@/lib/team-directory";
import { cn } from "@/lib/utils";

function defaultLeagueUrl(competition: string) {
  if (!competition.trim()) {
    return "";
  }

  return "https://www.laliganacional.com.ar/";
}

export function CreateTeamModal({
  canEdit,
  defaultCompetition = "",
  triggerVariant = "default",
  initialTeam = null,
  triggerClassName,
}: {
  canEdit: boolean;
  defaultCompetition?: string;
  triggerVariant?: "default" | "icon";
  initialTeam?: TeamDirectoryItem | null;
  triggerClassName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [officialName, setOfficialName] = useState("");
  const [competition, setCompetition] = useState(defaultCompetition);
  const [stadium, setStadium] = useState("");
  const [manager, setManager] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [officialUrl, setOfficialUrl] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(initialTeam?.logo_data_url ?? null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, startSaving] = useTransition();
  const isEditMode = Boolean(initialTeam);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  const competitionOptions = useMemo(() => {
    const options = new Set<string>(CLUB_COMPETITIONS);
    const current = (initialTeam?.competition ?? "").trim();

    if (current) {
      options.add(current);
    }

    return [...options];
  }, [initialTeam?.competition]);

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
  }, [defaultCompetition, isOpen]);

  function resetForm() {
    setOfficialName(initialTeam?.official_name ?? "");
    setCompetition(initialTeam?.competition ?? defaultCompetition);
    setStadium(initialTeam?.stadium ?? "");
    setManager(initialTeam?.manager ?? "");
    setWebsite(initialTeam?.website ?? "");
    setInstagram(initialTeam?.instagram ?? "");
    setOfficialUrl(initialTeam?.official_url ?? "");
    setLogoPreview(initialTeam?.logo_data_url ?? null);
    setErrorMessage("");
  }

  function closeModal() {
    setIsOpen(false);
    resetForm();
  }

  function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const nextValue = typeof reader.result === "string" ? reader.result : null;
      setLogoPreview(nextValue);
    };

    reader.readAsDataURL(file);
  }

  function clearLogo() {
    setLogoPreview(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEdit || isSaving) {
      return;
    }

    const trimmedName = officialName.trim();
    const trimmedCompetition = competition.trim();

    if (!trimmedName || !trimmedCompetition) {
      setErrorMessage("Nombre oficial y liga son obligatorios.");
      return;
    }

    const payload = new FormData();
    if (initialTeam?.id) {
      payload.set("teamId", initialTeam.id);
    }
    payload.set("officialName", trimmedName);
    payload.set("competition", trimmedCompetition);
    payload.set("stadium", stadium.trim());
    payload.set("manager", manager.trim());
    payload.set("website", website.trim());
    payload.set("instagram", instagram.trim());
    payload.set(
      "officialUrl",
      officialUrl.trim() || defaultLeagueUrl(trimmedCompetition),
    );
    payload.set("logoDataUrl", logoPreview ?? "");

    startSaving(async () => {
      const result = await upsertTeamAction(payload);

      if (!result.ok) {
        setErrorMessage(result.error ?? "No se pudo guardar el equipo.");
        return;
      }

      closeModal();
      router.refresh();
    });
  }

  return (
    <>
      {triggerVariant === "icon" ? (
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => {
            resetForm();
            setIsOpen(true);
          }}
          aria-label={isEditMode ? "Editar equipo" : "Editar equipos"}
          title={isEditMode ? "Editar equipo" : "Editar equipos"}
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-[var(--n-100)] text-[var(--n-500)] transition hover:bg-[var(--n-100)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60",
            triggerClassName,
          )}
        >
          <Pencil className="size-4" />
        </button>
      ) : (
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => {
            resetForm();
            setIsOpen(true);
          }}
          className="inline-flex h-[52px] items-center gap-2 rounded-[var(--panel-radius)] bg-[var(--accent)] px-5 text-sm font-extrabold text-white shadow-[0_14px_28px_rgba(227,27,35,0.18)] transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isEditMode ? <Pencil className="size-4" /> : <Plus className="size-4" />}
          {isEditMode ? "Editar equipo" : "Registrar equipo"}
        </button>
      )}

      {isOpen && typeof document !== "undefined"
        ? createPortal(
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-[var(--n-900)]/60 p-4 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="panel-surface relative flex w-full max-w-3xl flex-col overflow-hidden border border-[var(--border)] bg-[var(--surface)] shadow-[0_24px_64px_rgba(28,13,16,0.22)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[var(--border)] px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <Shield className="size-5" />
                  </span>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--accent)]">
                      Equipos
                    </p>
                    <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">
                      {isEditMode ? "Editar equipo" : "Registrar equipo"}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {isEditMode
                        ? "Los cambios se guardan para todo el equipo y se ven de inmediato en el directorio."
                        : "Se guarda para todo el equipo y aparece de inmediato en el directorio."}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="inline-flex size-10 items-center justify-center rounded-full bg-[var(--background-soft)] text-[var(--n-400)] transition hover:bg-[var(--n-100)] hover:text-[var(--n-700)]"
                  aria-label="Cerrar modal"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 p-6">
              <section className="rounded-[var(--panel-radius)] border border-[var(--n-100)] bg-[#fbfbfb] p-5">
                <div className="flex flex-col gap-5 md:flex-row md:items-center">
                  <div className="flex items-center gap-4">
                    <div className="relative flex size-24 items-center justify-center overflow-hidden rounded-[var(--panel-radius)] border border-[var(--n-200)] bg-white shadow-sm">
                      {logoPreview ? (
                        <Image
                          src={logoPreview}
                          alt="Preview del escudo"
                          fill
                          unoptimized
                          sizes="96px"
                          className="object-contain p-2"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center bg-[#f3f4f6] text-[var(--n-400)]">
                          <Shield className="size-9" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[var(--n-700)]">
                        Escudo del equipo
                      </p>
                      <p className="max-w-[18rem] text-sm leading-6 text-[var(--n-500)]">
                        Sube el escudo en PNG 500 x 500, idealmente sin fondo.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 md:ml-auto">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!canEdit}
                      className="inline-flex h-11 items-center gap-2 rounded-[var(--panel-radius)] border border-[var(--n-200)] bg-white px-4 text-sm font-semibold text-[var(--n-700)] transition hover:bg-[var(--n-50)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <ImagePlus className="size-4 text-[var(--accent)]" />
                      Subir escudo
                    </button>
                    <button
                      type="button"
                      onClick={clearLogo}
                      disabled={!logoPreview || !canEdit}
                      className="inline-flex h-11 items-center gap-2 rounded-[var(--panel-radius)] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 text-sm font-semibold text-[var(--accent-strong)] transition hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="size-4" />
                      Quitar
                    </button>
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/webp,image/svg+xml,image/*"
                  onChange={handleLogoChange}
                  className="hidden"
                />
              </section>

              <div className="grid gap-6 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-bold text-[var(--n-700)]">
                    Nombre oficial
                  </span>
                  <Input
                    value={officialName}
                    onChange={(event) => setOfficialName(event.target.value)}
                    placeholder="Ej. 9 de Julio de Morteros"
                    className="h-11 rounded-xl bg-[var(--background-soft)]"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-bold text-[var(--n-700)]">
                    Liga
                  </span>
                  <Select
                    value={competition}
                    onChange={(event) => setCompetition(event.target.value)}
                    className="h-11 rounded-xl bg-[var(--background-soft)]"
                  >
                    <option value="">Seleccionar liga...</option>
                    {competitionOptions.map((competitionOption) => (
                      <option key={competitionOption} value={competitionOption}>
                        {competitionOption}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-bold text-[var(--n-700)]">
                    Estadio
                  </span>
                  <Input
                    value={stadium}
                    onChange={(event) => setStadium(event.target.value)}
                    placeholder="Ej. Ángel Sandrín"
                    className="h-11 rounded-xl bg-[var(--background-soft)]"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-bold text-[var(--n-700)]">
                    Responsable de cancha
                  </span>
                  <Input
                    value={manager}
                    onChange={(event) => setManager(event.target.value)}
                    placeholder="Nombre del responsable"
                    className="h-11 rounded-xl bg-[var(--background-soft)]"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-bold text-[var(--n-700)]">
                    Sitio web
                  </span>
                  <Input
                    value={website}
                    onChange={(event) => setWebsite(event.target.value)}
                    placeholder="https://..."
                    className="h-11 rounded-xl bg-[var(--background-soft)]"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-bold text-[var(--n-700)]">
                    Instagram
                  </span>
                  <Input
                    value={instagram}
                    onChange={(event) => setInstagram(event.target.value)}
                    placeholder="https://instagram.com/..."
                    className="h-11 rounded-xl bg-[var(--background-soft)]"
                  />
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-sm font-bold text-[var(--n-700)]">
                  Enlace oficial
                </span>
                <Input
                  value={officialUrl}
                  onChange={(event) => setOfficialUrl(event.target.value)}
                  placeholder="https://..."
                  className="h-11 rounded-xl bg-[var(--background-soft)]"
                />
              </label>

              {errorMessage ? (
                <div className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3 text-sm font-semibold text-[var(--accent-strong)]">
                  {errorMessage}
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] pt-5">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 rounded-xl px-5"
                  onClick={closeModal}
                >
                  Cancelar
                </Button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-bold text-white shadow-[0_14px_28px_rgba(227,27,35,0.18)] transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="size-4" />
                  {isSaving
                    ? "Guardando..."
                    : isEditMode
                      ? "Guardar cambios"
                      : "Guardar equipo"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
