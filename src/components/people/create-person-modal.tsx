"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  FileText,
  ImagePlus,
  KeyRound,
  Power,
  Save,
  ShieldCheck,
  Trash2,
  UserPlus2,
  UserRound,
  UserSearch,
  X,
} from "lucide-react";

import { upsertPersonAction } from "@/app/actions/people";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { PersonFunctionsField } from "@/components/people/person-functions-field";
import { getRoleDisplayName } from "@/lib/display";
import { cn } from "@/lib/utils";

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function ModalFieldLabel({
  children,
  required = false,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <span className="flex items-center gap-2 text-sm font-semibold text-[#334155]">
      {children}
      {required ? (
        <span className="inline-block size-1.5 rounded-full bg-[var(--accent)]" />
      ) : null}
    </span>
  );
}

function SectionHeading({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="mb-6 flex items-center gap-2">
      <span className="text-[#98a2b3]">{icon}</span>
      <h4 className="text-sm font-black uppercase tracking-[0.2em] text-[#667085]">
        {title}
      </h4>
    </div>
  );
}

export function CreatePersonModal({
  canEdit,
  canManageAccess,
  redirectTo,
  roleOptions,
  teamOptions,
}: {
  canEdit: boolean;
  canManageAccess: boolean;
  redirectTo: string;
  roleOptions: string[];
  teamOptions: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [createPlatformAccess, setCreatePlatformAccess] = useState(false);
  const [fullNameValue, setFullNameValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const initials = useMemo(() => getInitials(fullNameValue), [fullNameValue]);

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAvatarPreview(typeof reader.result === "string" ? reader.result : null);
    };
    reader.readAsDataURL(file);
  };

  const clearAvatar = () => {
    setAvatarPreview(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const fieldClassName =
    "h-12 rounded-[var(--panel-radius)] border-[#e5e7eb] bg-[#f9f9f9] text-[15px] font-medium text-[#1f2937] placeholder:text-[#98a2b3] shadow-[inset_0_2px_4px_rgba(15,23,42,0.04)] focus:border-[var(--accent)] focus:bg-white focus:ring-[3px] focus:ring-[rgba(230,18,56,0.08)]";

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex h-[52px] items-center gap-2 rounded-[var(--panel-radius)] bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white shadow-[0_16px_32px_rgba(230,18,56,0.22)] transition hover:bg-[var(--accent-strong)]"
      >
        <UserPlus2 className="size-4" />
        Crear personal
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(15,23,42,0.48)] p-4 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-[1000px] flex-col overflow-hidden rounded-[var(--panel-radius)] border border-[#e6e8ec] bg-white shadow-[0_32px_80px_rgba(15,23,42,0.26)]"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="shrink-0 border-b border-[#f1f3f5] bg-white px-8 py-6">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-[2rem] font-extrabold tracking-[-0.04em] text-[#1b1520]">
                    Crear personal
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex size-10 items-center justify-center rounded-xl text-[#98a2b3] transition hover:bg-[#f7f5f6] hover:text-[#5b6472]"
                  aria-label="Cerrar modal"
                >
                  <X className="size-5" />
                </button>
              </div>
            </header>

            <form action={upsertPersonAction} className="flex min-h-0 flex-1 flex-col">
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <input
                type="hidden"
                name="createPlatformAccess"
                value={createPlatformAccess ? "on" : "off"}
              />
              <input type="hidden" name="accessRole" value="collaborator" />

              <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto bg-[#faf7f7]">
                <section className="border-b border-[#f1f3f5] bg-white px-8 py-8">
                  <div className="flex flex-wrap items-center gap-8">
                    <div className="relative group">
                      <div className="relative flex size-32 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[#eef2f6] shadow-[0_10px_24px_rgba(15,23,42,0.12)]">
                        {avatarPreview ? (
                          <Image
                            src={avatarPreview}
                            alt="Preview del avatar"
                            fill
                            unoptimized
                            sizes="128px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex size-full items-center justify-center text-[#7b8798]">
                            {initials ? (
                              <span className="text-[2rem] font-black tracking-[-0.04em]">
                                {initials}
                              </span>
                            ) : (
                              <UserRound className="size-11" />
                            )}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={!canEdit}
                          className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition group-hover:opacity-100 disabled:pointer-events-none"
                          aria-label="Cambiar foto"
                        >
                          <ImagePlus className="size-8 text-white" />
                        </button>
                      </div>
                    </div>

                    <div className="min-w-[280px] flex-1 space-y-4">
                      <div>
                        <h4 className="text-lg font-semibold text-[#111827]">
                          Fotografía de perfil
                        </h4>
                        <p className="mt-1 text-sm text-[#667085]">
                          Sube una imagen JPG o PNG. Tamaño máximo sugerido: 2 MB.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={!canEdit}
                          className="inline-flex h-11 items-center gap-2 rounded-[var(--panel-radius)] border border-[#e5e7eb] bg-[#f8fafc] px-5 text-sm font-semibold text-[#475467] transition hover:bg-[#eef2f6] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <ImagePlus className="size-4 text-[var(--accent)]" />
                          Cambiar foto
                        </button>
                        <button
                          type="button"
                          onClick={clearAvatar}
                          disabled={!avatarPreview || !canEdit}
                          className="inline-flex h-11 items-center gap-2 rounded-[var(--panel-radius)] px-5 text-sm font-semibold text-[var(--accent)] transition hover:bg-[rgba(230,18,56,0.05)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 className="size-4" />
                          Eliminar
                        </button>
                      </div>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                  </div>
                </section>

                <div className="lg:grid lg:grid-cols-3">
                  <section className="border-b border-[#f1f3f5] bg-white px-8 py-8 lg:col-span-2 lg:border-b-0 lg:border-r">
                    <SectionHeading
                      icon={<UserRound className="size-5" />}
                      title="Información principal"
                    />

                    <div className="space-y-6">
                      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        <label className="space-y-2">
                          <ModalFieldLabel required>Nombre completo</ModalFieldLabel>
                          <Input
                            name="fullName"
                            placeholder="Ej. Juan Pérez"
                            disabled={!canEdit}
                            className={fieldClassName}
                            value={fullNameValue}
                            onChange={(event) => setFullNameValue(event.target.value)}
                          />
                        </label>

                        <label className="space-y-2">
                          <ModalFieldLabel required>Teléfono</ModalFieldLabel>
                          <Input
                            name="phone"
                            placeholder="+34 000 000 000"
                            disabled={!canEdit}
                            className={fieldClassName}
                          />
                        </label>

                        <label className="space-y-2">
                          <ModalFieldLabel required>Correo electrónico</ModalFieldLabel>
                          <Input
                            name="email"
                            placeholder="juan.perez@basketproduction.com"
                            disabled={!canEdit}
                            className={fieldClassName}
                          />
                        </label>

                        <label className="space-y-2">
                          <ModalFieldLabel>Ciudad</ModalFieldLabel>
                          <Input
                            name="city"
                            placeholder="Madrid"
                            disabled={!canEdit}
                            className={fieldClassName}
                          />
                        </label>

                        <label className="space-y-2 md:col-span-2">
                          <ModalFieldLabel required>Rol principal</ModalFieldLabel>
                          <div className="relative">
                            <Select
                              name="roleName"
                              defaultValue=""
                              disabled={!canEdit}
                              className={cn(fieldClassName, "appearance-none pr-10")}
                            >
                              <option value="">Seleccionar rol</option>
                              {roleOptions.map((roleName) => (
                                <option key={roleName} value={roleName}>
                                  {getRoleDisplayName(roleName)}
                                </option>
                              ))}
                            </Select>
                            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[#98a2b3]" />
                          </div>
                        </label>

                        <div className="md:col-span-2">
                          <PersonFunctionsField selected={[]} disabled={!canEdit} />
                        </div>
                      </div>

                      <label className="space-y-2">
                        <ModalFieldLabel>Responsable</ModalFieldLabel>
                        <div className="group">
                          <div className="relative">
                            <UserSearch className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#98a2b3] transition group-focus-within:text-[var(--accent)]" />
                            <Input
                              name="coverageTeams"
                              list="people-team-options"
                              placeholder="Buscar y asignar responsable..."
                              disabled={!canEdit}
                              className={cn(fieldClassName, "pl-11")}
                            />
                            <datalist id="people-team-options">
                              {teamOptions.map((teamName) => (
                                <option key={teamName} value={teamName} />
                              ))}
                            </datalist>
                          </div>
                          <p className="pl-1 text-[11px] italic text-[#98a2b3]">
                            Empieza a escribir para ver sugerencias de personal directivo
                          </p>
                        </div>
                      </label>
                    </div>
                  </section>

                  <div className="flex flex-col lg:col-span-1">
                    <section className="bg-white px-8 py-8 lg:flex lg:h-full lg:flex-col">
                      <SectionHeading
                        icon={<FileText className="size-5" />}
                        title="Notas"
                      />

                      <label className="space-y-2 lg:flex lg:flex-1 lg:flex-col">
                        <ModalFieldLabel>Notas</ModalFieldLabel>
                        <Textarea
                          name="notes"
                          placeholder="Añade cualquier detalle relevante sobre el perfil del colaborador..."
                          disabled={!canEdit}
                          className="min-h-[140px] rounded-[var(--panel-radius)] border-[#e5e7eb] bg-[#f9f9f9] text-[15px] font-medium text-[#1f2937] placeholder:text-[#98a2b3] shadow-[inset_0_2px_4px_rgba(15,23,42,0.04)] focus:border-[var(--accent)] focus:bg-white focus:ring-[3px] focus:ring-[rgba(230,18,56,0.08)] lg:min-h-0 lg:flex-1"
                        />
                      </label>
                    </section>
                  </div>
                </div>

                {canManageAccess ? (
                  <section className="border-t border-[#f1f3f5] bg-[#faf7f7] px-8 py-8">
                    <div className="rounded-[var(--panel-radius)] border-2 border-[rgba(211,49,49,0.10)] bg-white p-6 shadow-sm">
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex gap-4">
                          <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-[rgba(211,49,49,0.1)] text-[var(--accent)]">
                            <ShieldCheck className="size-6" />
                          </div>

                          <div className="space-y-1">
                            <h4 className="font-bold text-[#111827]">
                              Acceso a la plataforma
                            </h4>
                            <p className="max-w-xl text-sm text-[#667085]">
                              Permite que este colaborador inicie sesión con su correo y entre directo a Mi jornada.
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col items-start gap-2 lg:items-end">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={createPlatformAccess}
                            onClick={() =>
                              setCreatePlatformAccess((currentValue) => !currentValue)
                            }
                            disabled={!canEdit}
                            className={cn(
                              "relative inline-flex h-7 w-14 items-center rounded-full transition",
                              createPlatformAccess ? "bg-[var(--accent)]" : "bg-[#d8dee8]",
                              !canEdit && "cursor-not-allowed opacity-60",
                            )}
                          >
                            <span
                              className={cn(
                                "inline-block size-6 rounded-full border border-white bg-white transition",
                                createPlatformAccess
                                  ? "translate-x-7"
                                  : "translate-x-0.5",
                              )}
                            />
                          </button>

                          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                            {createPlatformAccess
                              ? "Acceso habilitado"
                              : "Acceso desactivado"}
                          </span>
                        </div>
                      </div>

                      {createPlatformAccess ? (
                        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                          <div className="rounded-[var(--panel-radius)] border border-[#e5e7eb] bg-[#f9f9f9] px-4 py-3 shadow-[inset_0_2px_4px_rgba(15,23,42,0.04)]">
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#95a3ba]">
                              Correo de ingreso
                            </p>
                            <p className="mt-1 text-sm font-medium text-[#344054]">
                              Se usará el correo del formulario para iniciar sesión como colaborador.
                            </p>
                          </div>

                          <label className="space-y-2">
                            <ModalFieldLabel required>Contraseña temporal</ModalFieldLabel>
                            <div className="relative">
                              <KeyRound className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#98a2b3]" />
                              <Input
                                name="temporaryPassword"
                                type="password"
                                placeholder="Mínimo 8 caracteres"
                                disabled={!canEdit}
                                className={cn(fieldClassName, "pl-11")}
                              />
                            </div>
                          </label>
                        </div>
                      ) : null}

                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setCreatePlatformAccess(false)}
                          disabled={!createPlatformAccess || !canEdit}
                          className="inline-flex h-10 items-center gap-2 rounded-[var(--panel-radius)] px-4 text-sm font-semibold text-[var(--accent)] transition hover:bg-[rgba(211,49,49,0.06)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Power className="size-4" />
                          Revocar acceso
                        </button>
                      </div>
                    </div>
                  </section>
                ) : null}
              </div>

              <footer className="mt-auto flex shrink-0 items-center justify-end gap-4 border-t border-[#f1f3f5] bg-white px-8 py-5 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex h-11 items-center justify-center rounded-[var(--panel-radius)] px-6 text-sm font-bold text-[#667085] transition hover:bg-[#f2f4f7]"
                >
                  Cancelar
                </button>

                {canEdit ? (
                  <SubmitButton
                    pendingLabel="Guardando..."
                    className="h-11 gap-2 rounded-[var(--panel-radius)] px-8 text-sm font-bold shadow-[0_14px_32px_rgba(230,18,56,0.18)]"
                  >
                    <Save className="size-4" />
                    Guardar personal
                  </SubmitButton>
                ) : (
                  <Button
                    variant="secondary"
                    disabled
                    className="h-11 rounded-[var(--panel-radius)] px-7"
                  >
                    Solo lectura
                  </Button>
                )}
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
