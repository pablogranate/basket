import { submitAccessRequestAction } from "@/app/actions/access-requests";
import { PhoneFieldClient } from "@/components/access-requests/phone-field-client";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { ACCESS_REQUEST_FUNCIONES } from "@/lib/access-requests/constants";

export function AccessRequestForm({ email }: { email: string }) {
  return (
    <form action={submitAccessRequestAction} className="space-y-4 text-left">
      <input type="hidden" name="redirectTo" value="/no-access" />

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
        <PhoneFieldClient name="phone" />
      </div>

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
          placeholder="Quién te recomendó, con qué equipo trabajás…"
        />
      </div>

      <SubmitButton className="w-full" pendingLabel="Enviando...">
        Enviar solicitud
      </SubmitButton>
    </form>
  );
}
