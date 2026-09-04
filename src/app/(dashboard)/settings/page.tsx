import { Bot, KeyRound, Megaphone, Settings2, UserPlus, UserRound } from "lucide-react";

import {
  saveAccessRequestRecipientsAction,
  saveAnnouncementAction,
  saveGeminiSettingsAction,
  savePreferencesAction,
} from "@/app/actions/settings";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageMessage } from "@/components/ui/page-message";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { requireUserContext } from "@/lib/auth";
import { SECTION_COPY } from "@/lib/copy";
import { getAccessRequestRecipientConfig } from "@/lib/access-requests/config";
import { ACCESS_REQUEST_FUNCIONES } from "@/lib/access-requests/constants";
import { getLatestAnnouncement } from "@/lib/data/announcements";
import { ProfileAvatarSettings } from "@/components/settings/profile-avatar-settings";
import { GEMINI_MODEL_OPTIONS, getSettingsSnapshot, UI_DENSITY_OPTIONS } from "@/lib/settings";
import { parseNotice } from "@/lib/search-params";
import { can } from "@/lib/roles";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SettingsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const { intent, notice } = parseNotice(resolvedSearchParams);

  const user = await requireUserContext();
  const isAdmin = can(user, "admin");
  // Settings and the latest announcement are independent — resolve both
  // concurrently.
  const [settings, latestAnnouncement, recipientConfig] = await Promise.all([
    getSettingsSnapshot(),
    isAdmin ? getLatestAnnouncement(user) : Promise.resolve(null),
    isAdmin
      ? getAccessRequestRecipientConfig()
      : Promise.resolve(null),
  ]);
  const displayName =
    user.profile?.full_name?.trim() || user.email?.split("@")[0] || "Usuario";

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="font-[family-name:var(--font-oswald)] text-4xl font-bold tracking-tight text-[var(--foreground)]">
          {SECTION_COPY.settings.title}
        </h2>
        <p className="max-w-2xl text-sm font-medium leading-6 text-[var(--n-600)]">
          {SECTION_COPY.settings.description}
        </p>
      </section>

      <PageMessage intent={intent} message={notice} />

      <Card className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="inline-flex size-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <UserRound className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-[var(--foreground)]">
              Perfil y avatar
            </h3>
            <p className="text-sm text-[var(--n-600)]">
              {displayName} · {user.email}
            </p>
          </div>
        </div>
        <ProfileAvatarSettings
          userId={user.userId}
          email={user.email}
          fullName={displayName}
        />
      </Card>

      <Card className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="inline-flex size-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <Bot className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-[var(--foreground)]">
              Gemini
            </h3>
            <p className="text-sm text-[var(--n-600)]">
              Configura la clave para habilitar la IA del portal. Si eres admin,
              también quedará disponible para colaboradores y módulos operativos.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3 text-sm text-[var(--n-600)]">
          Estado actual:{" "}
          <span className="font-bold text-[var(--foreground)]">
            {settings.hasGeminiKey ? "Configurado" : "Sin configurar"}
          </span>
          {settings.geminiSource === "personal" ? (
            <span className="ml-2 font-mono text-xs text-[var(--n-400)]">
              config personal activa
            </span>
          ) : null}
          {settings.geminiSource === "portal" ? (
            <span className="ml-2 font-mono text-xs text-[var(--n-400)]">
              config global del portal activa
            </span>
          ) : null}
          {settings.geminiSource === "env" ? (
            <span className="ml-2 font-mono text-xs text-[var(--n-400)]">
              variable del servidor activa
            </span>
          ) : null}
        </div>

        <form action={saveGeminiSettingsAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="redirectTo" value="/settings" />
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-bold text-[var(--n-700)]">
              API key de Gemini
            </span>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[var(--n-400)]" />
              <Input
                name="geminiApiKey"
                type="password"
                placeholder="Pega aquí tu API key de Gemini"
                className="h-11 rounded-xl bg-[var(--background-soft)] pl-11"
              />
            </div>
            <span className="block text-xs text-[var(--n-400)]">
              Prioridad efectiva: configuración personal, luego portal, luego variable del servidor.
            </span>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold text-[var(--n-700)]">Modelo</span>
            <Select
              name="geminiModel"
              defaultValue={settings.geminiModel}
              className="h-11 rounded-xl bg-[var(--background-soft)]"
            >
              {GEMINI_MODEL_OPTIONS.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex items-end justify-end">
            <SubmitButton
              pendingLabel="Guardando..."
              className="h-11 rounded-xl px-5 text-sm font-bold"
            >
              Guardar Gemini
            </SubmitButton>
          </div>
        </form>
      </Card>

      <Card className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="inline-flex size-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <Settings2 className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-[var(--foreground)]">
              Preferencias
            </h3>
            <p className="text-sm text-[var(--n-600)]">
              Ajustes básicos de interfaz y experiencia de uso.
            </p>
          </div>
        </div>

        <form action={savePreferencesAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="redirectTo" value="/settings" />
          <label className="space-y-2">
            <span className="text-sm font-bold text-[var(--n-700)]">
              Densidad de interfaz
            </span>
            <Select
              name="uiDensity"
              defaultValue={settings.uiDensity}
              className="h-11 rounded-xl bg-[var(--background-soft)]"
            >
              {UI_DENSITY_OPTIONS.map((density) => (
                <option key={density} value={density}>
                  {density === "comoda" ? "Cómoda" : "Compacta"}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex items-end justify-end">
            <SubmitButton
              pendingLabel="Guardando..."
              className="h-11 rounded-xl px-5 text-sm font-bold"
            >
              Guardar preferencias
            </SubmitButton>
          </div>
        </form>
      </Card>

      {isAdmin ? (
        <Card className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="inline-flex size-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Megaphone className="size-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-[var(--foreground)]">
                Comunicado general
              </h3>
              <p className="text-sm text-[var(--n-600)]">
                Publica un popup para todos los colaboradores después del login y
                mantenlo disponible desde la campana del header.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3 text-sm text-[var(--n-600)]">
            Estado actual:{" "}
            <span className="font-bold text-[var(--foreground)]">
              {latestAnnouncement?.active
                ? "Publicado y visible"
                : latestAnnouncement
                  ? "Guardado sin publicar"
                  : "Sin comunicado cargado"}
            </span>
            {latestAnnouncement ? (
              <span className="ml-2 text-xs text-[var(--n-400)]">
                Última edición: {new Intl.DateTimeFormat("es-CO", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(latestAnnouncement.updated_at))}
              </span>
            ) : null}
          </div>

          <form action={saveAnnouncementAction} className="grid gap-4">
            <input type="hidden" name="redirectTo" value="/settings" />
            <input
              type="hidden"
              name="announcementId"
              value={latestAnnouncement?.id ?? ""}
            />

            <label className="space-y-2">
              <span className="text-sm font-bold text-[var(--n-700)]">Título</span>
              <Input
                name="announcementTitle"
                defaultValue={latestAnnouncement?.title ?? ""}
                placeholder="Ej. Ajuste de horarios para la jornada de hoy"
                className="h-11 rounded-xl bg-[var(--background-soft)]"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-[var(--n-700)]">Mensaje</span>
              <Textarea
                name="announcementBody"
                defaultValue={latestAnnouncement?.body ?? ""}
                placeholder="Escribe aquí el comunicado que verán todos al iniciar sesión."
                className="bg-[var(--background-soft)]"
              />
            </label>

            <label className="inline-flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3 text-sm font-semibold text-[var(--n-700)]">
              <input
                type="checkbox"
                name="announcementActive"
                defaultChecked={latestAnnouncement?.active ?? false}
                className="size-4 rounded border-[var(--border)] text-[var(--accent)]"
              />
              Mostrar este comunicado justo después del login
            </label>

            <div className="flex justify-end">
              <SubmitButton
                pendingLabel="Publicando..."
                className="h-11 rounded-xl px-5 text-sm font-bold"
              >
                Guardar comunicado
              </SubmitButton>
            </div>
          </form>
        </Card>
      ) : null}
      {isAdmin && recipientConfig ? (
        <Card className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="inline-flex size-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <UserPlus className="size-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-[var(--foreground)]">
                Avisos de solicitudes de acceso
              </h3>
              <p className="text-sm text-[var(--n-600)]">
                A quién se le avisa por correo cuando alguien se registra. Varias
                direcciones separadas por coma. Los admin y productores ven la
                solicitud en el portal, no por correo.
              </p>
            </div>
          </div>

          <form action={saveAccessRequestRecipientsAction} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {ACCESS_REQUEST_FUNCIONES.map((funcion) => (
                <label key={funcion} className="space-y-2">
                  <span className="text-sm font-bold text-[var(--n-700)]">
                    {funcion}
                  </span>
                  <input type="hidden" name="funcion" value={funcion} />
                  <Input
                    name="recipients"
                    defaultValue={(recipientConfig.byFuncion[funcion] ?? []).join(", ")}
                    placeholder="nombre@basquetpass.tv"
                    className="h-11 rounded-xl bg-[var(--background-soft)]"
                  />
                </label>
              ))}
            </div>

            <label className="space-y-2">
              <span className="text-sm font-bold text-[var(--n-700)]">
                Siempre notificar a
              </span>
              <Input
                name="alwaysRecipients"
                defaultValue={recipientConfig.always.join(", ")}
                placeholder="produccion@basquetpass.tv"
                className="h-11 rounded-xl bg-[var(--background-soft)]"
              />
            </label>

            <div className="flex justify-end">
              <SubmitButton
                pendingLabel="Guardando..."
                className="h-11 rounded-xl px-5 text-sm font-bold"
              >
                Guardar destinatarios
              </SubmitButton>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}