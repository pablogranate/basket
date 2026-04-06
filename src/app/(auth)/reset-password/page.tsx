import Link from "next/link";
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";

import { updatePasswordAction } from "@/app/actions/auth";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { PageMessage } from "@/components/ui/page-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { parseNotice } from "@/lib/search-params";
import { getSupabaseUserSafely } from "@/lib/supabase/auth-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const { intent, notice } = parseNotice(resolvedSearchParams);
  const supabase = await createSupabaseServerClient();
  const { user } = await getSupabaseUserSafely(supabase);

  if (!user) {
    return (
      <AuthPageShell
        eyebrow="Enlace inválido"
        title="Solicita un enlace nuevo"
        description="El acceso de recuperación ya no es válido o expiró. Pide otro enlace y vuelve a intentarlo."
        footer={
          <p className="mt-6 text-center text-sm font-medium text-[var(--muted)] xl:mt-8">
            <Link
              href="/forgot-password"
              className="inline-flex items-center gap-2 text-[var(--foreground)] underline transition hover:text-[var(--accent)]"
            >
              <ArrowLeft className="size-4" />
              Volver a recuperación
            </Link>
          </p>
        }
      >
        <PageMessage intent={intent} message={notice} />
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell
      eyebrow="Nueva contraseña"
      title="Crea una contraseña segura"
      description="Usa al menos 8 caracteres para completar el acceso a tu cuenta."
      footer={
        <p className="mt-6 text-center text-sm font-medium text-[var(--muted)] xl:mt-8">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-[var(--foreground)] underline transition hover:text-[var(--accent)]"
          >
            <ArrowLeft className="size-4" />
            Volver al login
          </Link>
        </p>
      }
    >
      <PageMessage intent={intent} message={notice} />

      <form action={updatePasswordAction} className="mt-5 space-y-[18px]">
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-[var(--foreground)]">
            Nueva contraseña
          </span>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-[var(--muted)]">
              <LockKeyhole className="size-5" />
            </div>
            <input
              type="password"
              name="password"
              placeholder="********"
              autoComplete="new-password"
              required
              className="block h-[52px] w-full rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] pl-11 pr-4 text-[15px] text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(230,18,56,0.12)] xl:h-14 xl:pl-12 xl:text-base"
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-bold text-[var(--foreground)]">
            Confirmar contraseña
          </span>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-[var(--muted)]">
              <LockKeyhole className="size-5" />
            </div>
            <input
              type="password"
              name="confirmPassword"
              placeholder="********"
              autoComplete="new-password"
              required
              className="block h-[52px] w-full rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] pl-11 pr-4 text-[15px] text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(230,18,56,0.12)] xl:h-14 xl:pl-12 xl:text-base"
            />
          </div>
        </label>

        <div className="grid gap-3 pt-3">
          <SubmitButton
            pendingLabel="Actualizando..."
            className="h-[52px] w-full gap-2 text-[15px] font-bold shadow-[0_8px_24px_rgba(230,18,56,0.26)] xl:h-14 xl:text-base"
          >
            Actualizar contraseña
            <ArrowRight className="size-5" />
          </SubmitButton>
        </div>
      </form>
    </AuthPageShell>
  );
}
