import { submitAccessRequestAction } from "@/app/actions/access-requests";
import { CiudadFieldClient } from "@/components/access-requests/ciudad-field-client";
import { PhoneFieldClient } from "@/components/access-requests/phone-field-client";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { ACCESS_REQUEST_FUNCIONES } from "@/lib/access-requests/constants";
import { buildNoAccessPath } from "@/lib/access-requests/no-access";

// One form for every app's Solicitud; only the portal asks for a Función.
export function AccessRequestForm({
  email,
  app,
  asksFuncion,
}: {
  email: string;
  app: string;
  asksFuncion: boolean;
}) {
  return (
    <form action={submitAccessRequestAction} className="space-y-4 text-left">
      <input type="hidden" name="redirectTo" value={buildNoAccessPath(app)} />
      <input type="hidden" name="app" value={app} />

      <div className="space-y-1.5">
        <label
          htmlFor="access-request-full-name"
          className="text-xs font-black uppercase tracking-[0.18em] text-[var(--n-500)]"
        >
          Nombre completo
        </label>
        <Input
          id="access-request-full-name"
          name="fullName"
          required
          minLength={3}
          autoComplete="name"
          placeholder="Ana Pérez"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-black uppercase tracking-[0.18em] text-[var(--n-500)]">
          Correo
        </label>
        <Input value={email} readOnly disabled className="opacity-70" />
        <p className="text-xs text-[var(--n-500)]">
          Es la cuenta con la que iniciaste sesión.
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="access-request-phone"
          className="text-xs font-black uppercase tracking-[0.18em] text-[var(--n-500)]"
        >
          Teléfono
        </label>
        <PhoneFieldClient id="access-request-phone" name="phone" />
      </div>

      {asksFuncion ? (
        <div className="space-y-1.5">
          <label
            htmlFor="access-request-funcion"
            className="text-xs font-black uppercase tracking-[0.18em] text-[var(--n-500)]"
          >
            Función
          </label>
          <Select id="access-request-funcion" name="funcion" required defaultValue="">
            <option value="" disabled>
              Elegí tu función
            </option>
            {ACCESS_REQUEST_FUNCIONES.map((funcion) => (
              <option key={funcion} value={funcion}>
                {funcion}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <CiudadFieldClient id="access-request-ciudad" />

      <div className="space-y-1.5">
        <label
          htmlFor="access-request-mensaje"
          className="text-xs font-black uppercase tracking-[0.18em] text-[var(--n-500)]"
        >
          Mensaje (opcional)
        </label>
        <Textarea
          id="access-request-mensaje"
          name="mensaje"
          rows={3}
          maxLength={500}
          placeholder="Con qué equipo trabajas…"
        />
      </div>

      <SubmitButton className="w-full" pendingLabel="Enviando...">
        Enviar solicitud
      </SubmitButton>
    </form>
  );
}
