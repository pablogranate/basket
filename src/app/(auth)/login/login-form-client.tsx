"use client";

import { useState } from "react";
import { ArrowRight, Mail } from "lucide-react";

import { authClient } from "@/lib/auth/client";
import { ensureErrorMessage } from "@/lib/utils";

export function LoginFormClient({ callbackURL }: { callbackURL: string }) {
  const [email, setEmail] = useState("");
  const [googlePending, setGooglePending] = useState(false);
  const [magicPending, setMagicPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle() {
    setError(null);
    setGooglePending(true);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL,
      });
      if (result.error) {
        setError(result.error.message ?? "No se pudo iniciar sesión con Google.");
        setGooglePending(false);
      }
    } catch (err) {
      setError(ensureErrorMessage(err));
      setGooglePending(false);
    }
  }

  async function handleMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setError("Ingresa tu correo electrónico.");
      return;
    }
    setError(null);
    setMagicPending(true);
    try {
      const result = await authClient.signIn.magicLink({
        email: normalized,
        callbackURL,
      });
      if (result.error) {
        setError(result.error.message ?? "No se pudo enviar el enlace.");
      } else {
        setSent(true);
      }
    } catch (err) {
      setError(ensureErrorMessage(err));
    } finally {
      setMagicPending(false);
    }
  }

  if (sent) {
    return (
      <div className="mt-5 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] p-6 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <Mail className="size-6" />
        </div>
        <h3 className="text-lg font-extrabold text-[var(--foreground)]">
          Revisá tu correo
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          Enviamos un enlace de acceso a{" "}
          <span className="font-bold text-[var(--foreground)]">{email.trim()}</span>.
          Abrilo en este dispositivo para entrar.
        </p>
        <button
          type="button"
          onClick={() => {
            setSent(false);
            setEmail("");
          }}
          className="mt-4 text-sm font-medium text-[var(--muted)] underline transition hover:text-[var(--accent)]"
        >
          Usar otro correo
        </button>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-[18px]">
      {error ? (
        <p className="rounded-[var(--panel-radius)] border border-[rgba(227,27,35,0.28)] bg-[rgba(227,27,35,0.06)] px-4 py-3 text-sm font-medium text-[var(--accent)]">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleGoogle}
        disabled={googlePending}
        className="flex h-[52px] w-full items-center justify-center gap-3 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] text-[15px] font-bold text-[var(--foreground)] transition hover:border-[var(--accent)] disabled:opacity-60 xl:h-14 xl:text-base"
      >
        <GoogleMark />
        {googlePending ? "Conectando..." : "Ingresar con Google"}
      </button>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--border)]" />
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
          o
        </span>
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <form onSubmit={handleMagicLink} className="space-y-[18px]">
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-[var(--foreground)]">
            Correo electrónico
          </span>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-[var(--muted)]">
              <Mail className="size-5" />
            </div>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="operaciones@canal.com"
              required
              className="block h-[52px] w-full rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] pl-11 pr-4 text-[15px] text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(227,27,35,0.12)] xl:h-14 xl:pl-12 xl:text-base"
            />
          </div>
        </label>

        <button
          type="submit"
          disabled={magicPending}
          className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[var(--panel-radius)] bg-[var(--accent)] text-[15px] font-bold text-white shadow-[0_8px_24px_rgba(227,27,35,0.26)] transition hover:opacity-90 disabled:opacity-60 xl:h-14 xl:text-base"
        >
          {magicPending ? "Enviando..." : "Enviarme un enlace de acceso"}
          <ArrowRight className="size-5" />
        </button>
      </form>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
