"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  FileText,
  ImagePlus,
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
import { APP_ROLE_DISPLAY_NAMES, getRoleDisplayName } from "@/lib/display";
import { cn } from "@/lib/utils";

const ACCESS_TIER_OPTIONS = [
  { value: "admin", label: APP_ROLE_DISPLAY_NAMES.admin },
  { value: "editor", label: APP_ROLE_DISPLAY_NAMES.editor },
  { value: "collaborator", label: APP_ROLE_DISPLAY_NAMES.collaborator },
] as const;

type AccessTierValue = (typeof ACCESS_TIER_OPTIONS)[number]["value"];

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
    <span className="flex items-center gap-2 text-sm font-semibold text-[var(--n-700)]">
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
      <span className="text-[var(--n-400)]">{icon}</span>
      <h4 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--n-500)]">
        {title}
      </h4>
    </div>
  );
}

export function CreatePersonModal({
  canEdit,
  canManageAccess,
  canSelectAccessTier,
  redirectTo,
  roleOptions,
  teamOptions,
}: {
  canEdit: boolean;
  canManageAccess: boolean;
  canSelectAccessTier: boolean;
  redirectTo: string;
  roleOptions: string[];
  teamOptions: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [createPlatformAccess, setCreatePlatformAccess] = useState(false);
  const [accessRole, setAccessRole] = useState<AccessTierValue>("collaborator");
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
    "h-12 rounded-[var(--panel-radius)] border-[var(--n-200)] bg-[var(--n-50)] text-[15px] font-medium text-[var(--n-800)] placeholder:text-[var(--n-400)] shadow-[inset_0_2px_4px_rgba(28,13,16,0.04)] focus:border-[var(--accent)] focus:bg-white focus:ring-[3px] focus:ring-[rgba(227,27,35,0.08)]";

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex h-[52px] items-center gap-2 rounded-[var(--panel-radius)] bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white shadow-[0_16px_32px_rgba(227,27,35,0.22)] transition hover:bg-[var(--accent-strong)]"
      >
        <UserPlus2 className="size-4" />
        Crear personal
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(28,13,16,0.48)] p-4 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-[1000px] flex-col overflow-hidden rounded-[var(--panel-radius)] border border-[var(--n-100)] bg-white shadow-[0_32px_80px_rgba(28,13,16,0.26)]"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="shrink-0 border-b border-[var(--n-100)] bg-white px-8 py-6">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-[2rem] font-extrabold tracking-[-0.04em] text-[var(--n-900)]">
                    Crear personal
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex size-10 items-center justify-center rounded-xl text-[var(--n-400)] transition hover:bg-[var(--n-100)] hover:text-[var(--n-600)]"
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
              <input
                type="hidden"
                name="accessRole"
                value={canSelectAccessTier ? accessRole : "collaborator"}
              />

              <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto bg-[var(--n-50)]">
                <section className="border-b border-[var(--n-100)] bg-white px-8 py-8">
                  <div className="flex flex-wrap items-center gap-8">
                    <div className="relative group">
                      <div className="relative flex size-32 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[var(--n-100)] shadow-[0_10px_24px_rgba(28,13,16,0.12)]">
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
                          <div className="flex size-full items-center justify-center text-[var(--n-500)]">
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
                        <h4 className="text-lg font-semibold text-[var(--n-900)]">
                          Fotografía de perfil
                        </h4>
                        <p className="mt-1 text-sm text-[var(--n-500)]">
                          Sube una imagen JPG o PNG. Tamaño máximo sugerido: 2 MB.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={!canEdit}
                          className="inline-flex h-11 items-center gap-2 rounded-[var(--panel-radius)] border border-[var(--n-200)] bg-[var(--n-50)] px-5 text-sm font-semibold text-[var(--n-700)] transition hover:bg-[var(--n-100)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <ImagePlus className="size-4 text-[var(--accent)]" />
                          Cambiar foto
                        </button>
                        <button
                          type="button"
                          onClick={clearAvatar}
                          disabled={!avatarPreview || !canEdit}
                          className="inline-flex h-11 items-center gap-2 rounded-[var(--panel-radius)] px-5 text-sm font-semibold text-[var(--accent)] transition hover:bg-[rgba(227,27,35,0.05)] disabled:cursor-not-allowed disabled:opacity-50"
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
                  <section className="border-b border-[var(--n-100)] bg-white px-8 py-8 lg:col-span-2 lg:border-b-0 lg:border-r">
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
                            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--n-400)]" />
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
                            <UserSearch className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[var(--n-400)] transition group-focus-within:text-[var(--accent)]" />
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
                          <p className="pl-1 text-[11px] italic text-[var(--n-400)]">
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
                          className="min-h-[140px] rounded-[var(--panel-radius)] border-[var(--n-200)] bg-[var(--n-50)] text-[15px] font-medium text-[var(--n-800)] placeholder:text-[var(--n-400)] shadow-[inset_0_2px_4px_rgba(28,13,16,0.04)] focus:border-[var(--accent)] focus:bg-white focus:ring-[3px] focus:ring-[rgba(227,27,35,0.08)] lg:min-h-0 lg:flex-1"
                        />
                      </label>
                    </section>
                  </div>
                </div>

                {canManageAccess ? (
                  <section className="border-t border-[var(--n-100)] bg-[var(--n-50)] px-8 py-8">
                    <div className="rounded-[var(--panel-radius)] border-2 border-[var(--accent-border)] bg-white p-6 shadow-sm">
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex gap-4">
                          <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                            <ShieldCheck className="size-6" />
                          </div>

                          <div className="space-y-1">
                            <h4 className="font-bold text-[var(--n-900)]">
                              Acceso a la plataforma
                            </h4>
                            <p className="max-w-xl text-sm text-[var(--n-500)]">
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
                              createPlatformAccess ? "bg-[var(--accent)]" : "bg-[var(--n-200)]",
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
                        <div className="mt-5 space-y-4">
                          <label className="space-y-2">
                            <ModalFieldLabel required>Nivel de acceso</ModalFieldLabel>
                            {canSelectAccessTier ? (
                              <div className="relative">
                                <Select
                                  value={accessRole}
                                  onChange={(event) =>
                                    setAccessRole(
                                      event.target.value as AccessTierValue,
                                    )
                                  }
                                  disabled={!canEdit}
                                  className={cn(fieldClassName, "appearance-none pr-10")}
                                >
                                  {ACCESS_TIER_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </Select>
                                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--n-400)]" />
                              </div>
                            ) : (
                              <div
                                className={cn(
                                  fieldClassName,
                                  "flex items-center",
                                )}
                              >
                                {APP_ROLE_DISPLAY_NAMES.collaborator}
                              </div>
                            )}
                          </label>

                          <div className="rounded-[var(--panel-radius)] border border-[var(--n-200)] bg-[var(--n-50)] px-4 py-3 shadow-[inset_0_2px_4px_rgba(28,13,16,0.04)]">
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--n-400)]">
                              Correo de ingreso
                            </p>
                            <p className="mt-1 text-sm font-medium text-[var(--n-700)]">
                              Se enviará una invitación al correo del formulario. El
                              colaborador ingresa con un enlace de acceso (o Google);
                              no se define contraseña.
                            </p>
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setCreatePlatformAccess(false)}
                          disabled={!createPlatformAccess || !canEdit}
                          className="inline-flex h-10 items-center gap-2 rounded-[var(--panel-radius)] px-4 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--accent-border)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Power className="size-4" />
                          Revocar acceso
                        </button>
                      </div>
                    </div>
                  </section>
                ) : null}
              </div>

              <footer className="mt-auto flex shrink-0 items-center justify-end gap-4 border-t border-[var(--n-100)] bg-white px-8 py-5 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex h-11 items-center justify-center rounded-[var(--panel-radius)] px-6 text-sm font-bold text-[var(--n-500)] transition hover:bg-[var(--n-100)]"
                >
                  Cancelar
                </button>

                {canEdit ? (
                  <SubmitButton
                    pendingLabel="Guardando..."
                    className="h-11 gap-2 rounded-[var(--panel-radius)] px-8 text-sm font-bold shadow-[0_14px_32px_rgba(227,27,35,0.18)]"
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
