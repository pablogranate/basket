import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  LockKeyhole,
  Mail,
  Radio,
  UsersRound,
  Video,
} from "lucide-react";

import { loginAction } from "@/app/actions/auth";
import { SetupPanel } from "@/components/layout/setup-panel";
import { PageMessage } from "@/components/ui/page-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { PRODUCT_COPY } from "@/lib/copy";
import { getDefaultDashboardHrefForRole, APP_NAME } from "@/lib/constants";
import { isSupabaseConfigured } from "@/lib/env";
import { parseNotice } from "@/lib/search-params";
import { getUserContext } from "@/lib/auth";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const { intent, notice } = parseNotice(resolvedSearchParams);
  const supportEmail = "soporte@dashboardproduccion.local";
  const supportWhatsAppHref: string | null = null;
  const supportContactHref = supportWhatsAppHref ?? `mailto:${supportEmail}`;

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
          <section className="hidden border-r border-[var(--border)] bg-[linear-gradient(180deg,#fffdfd_0%,#faf8f5_100%)] lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-12 2xl:p-16">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--foreground)] text-white">
                <Video className="size-5" />
              </div>
              <p className="text-xl font-extrabold tracking-tight text-[var(--foreground)]">
                {APP_NAME}
              </p>
            </div>
            <div className="max-w-2xl space-y-6">
              <p className="text-xs font-bold uppercase tracking-[0.32em] text-[var(--muted)]">
                {APP_NAME}
              </p>
              <h1 className="text-4xl font-black leading-[1.02] tracking-[-0.04em] text-[var(--foreground)] xl:text-5xl 2xl:text-6xl">
                Operación, talento y técnica en una sola consola.
              </h1>
              <p className="max-w-xl text-base font-medium leading-relaxed text-[var(--muted)] xl:text-lg">
                El proyecto ya está listo. Solo falta conectar Supabase para activar auth,
                CRUD, historial y permisos en tiempo real.
              </p>
            </div>
            <p className="text-sm font-medium text-[var(--muted)]">
              Configuración inicial del entorno operativo.
            </p>
          </section>

          <section className="flex min-h-screen items-center justify-center px-6 py-8 sm:px-8 lg:px-10 xl:px-12">
            <div className="w-full max-w-[500px]">
              <div className="mb-8 flex items-center gap-3 lg:hidden">
                <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--foreground)] text-white">
                  <Video className="size-5" />
                </div>
                <p className="text-xl font-extrabold tracking-tight text-[var(--foreground)]">
                  {APP_NAME}
                </p>
              </div>
              <SetupPanel />
            </div>
          </section>
        </div>
      </div>
    );
  }

  const user = await getUserContext();

  if (user.userId) {
    redirect(getDefaultDashboardHrefForRole(user.role));
  }

  const redirectTo =
    typeof resolvedSearchParams.redirectTo === "string"
      ? resolvedSearchParams.redirectTo
      : "/grid";

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
        <section className="relative hidden border-r border-[var(--border)] bg-[linear-gradient(180deg,#fffdfd_0%,#faf8f5_100%)] lg:flex lg:flex-col lg:justify-between lg:overflow-hidden lg:p-10 xl:p-12 2xl:p-16">
          <div className="absolute inset-0 opacity-[0.045] [background-image:radial-gradient(circle_at_top_left,rgba(230,18,56,0.42),transparent_26%),linear-gradient(rgba(28,13,16,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(28,13,16,0.08)_1px,transparent_1px)] [background-size:auto,42px_42px,42px_42px]" />

            <div className="relative z-10 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--foreground)] text-white">
                <Video className="size-5" />
              </div>
              <p className="text-xl font-extrabold tracking-tight text-[var(--foreground)]">
                {APP_NAME}
              </p>
            </div>

          <div className="relative z-10 max-w-2xl space-y-6 xl:space-y-8">
            <div className="space-y-4 xl:space-y-5">
              <p className="text-xs font-bold uppercase tracking-[0.32em] text-[var(--muted)]">
                {PRODUCT_COPY.loginHero.eyebrow}
              </p>
              <h1 className="text-4xl font-black leading-[1.02] tracking-[-0.04em] text-[var(--foreground)] xl:text-5xl 2xl:text-6xl">
                {PRODUCT_COPY.loginHero.titleLine1}
                <br />
                {PRODUCT_COPY.loginHero.titleLine2}.
              </h1>
              <p className="max-w-xl text-base font-medium leading-relaxed text-[var(--muted)] xl:text-lg">
                {PRODUCT_COPY.loginHero.description}
              </p>
            </div>

            <div className="grid gap-4 xl:gap-5">
              <div className="flex gap-4 rounded-[18px] border border-[var(--border)] bg-[rgba(255,255,255,0.68)] p-4 backdrop-blur-sm xl:gap-5 xl:p-5">
                <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] xl:size-11">
                  <Radio className="size-4 xl:size-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[var(--foreground)] xl:text-lg">
                    Operaciones en vivo
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                    Monitorea la grilla diaria, valida señales principales y coordina
                    equipos de producción sin fricción operativa.
                  </p>
                </div>
              </div>

              <div className="flex gap-4 rounded-[18px] border border-[var(--border)] bg-[rgba(255,255,255,0.68)] p-4 backdrop-blur-sm xl:gap-5 xl:p-5">
                <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] xl:size-11">
                  <UsersRound className="size-4 xl:size-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[var(--foreground)] xl:text-lg">
                    Gestión de talento
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                    Asigna relatores, comentaristas, soporte y responsables con trazabilidad
                    completa de cambios y confirmaciones.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <p className="relative z-10 text-sm font-medium text-[var(--muted)]">
            (c) 2026 {APP_NAME}. Acceso restringido para equipos operativos.
          </p>
        </section>

        <section className="flex min-h-screen items-center justify-center px-6 py-8 sm:px-8 lg:px-10 xl:px-12">
          <div className="w-full max-w-[400px] xl:max-w-[420px]">
            <div className="mb-8 flex items-center justify-center gap-3 text-center lg:hidden">
              <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--foreground)] text-white">
                <Video className="size-5" />
              </div>
              <p className="text-xl font-extrabold tracking-tight text-[var(--foreground)]">
                {APP_NAME}
              </p>
            </div>

            <div className="rounded-[22px] border border-[var(--border)] bg-[var(--surface)] p-7 shadow-[0_12px_34px_rgba(28,13,16,0.05)] sm:p-8 xl:p-9">
              <div className="mb-6 text-center xl:mb-7 lg:text-left">
                <p className="text-xs font-bold uppercase tracking-[0.32em] text-[var(--accent)]">
                  Hola bienvenido
                </p>
                <h2 className="mx-auto mt-2.5 max-w-[12rem] text-[1.8rem] font-black leading-[0.94] tracking-tight text-[var(--foreground)] lg:mx-0 lg:max-w-none xl:text-[2rem]">
                  Acceso a la plataforma
                </h2>
              </div>

              <PageMessage intent={intent} message={notice} />

              <form action={loginAction} className="mt-5 space-y-[18px]">
                <input type="hidden" name="redirectTo" value={redirectTo} />

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
                      placeholder="operaciones@canal.com"
                      required
                      className="block h-[52px] w-full rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] pl-11 pr-4 text-[15px] text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(230,18,56,0.12)] xl:h-14 xl:pl-12 xl:text-base"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-[var(--foreground)]">
                    Contraseña
                  </span>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-[var(--muted)]">
                      <LockKeyhole className="size-5" />
                    </div>
                    <input
                      type="password"
                      name="password"
                      placeholder="********"
                      required
                      className="block h-[52px] w-full rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] pl-11 pr-4 text-[15px] text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(230,18,56,0.12)] xl:h-14 xl:pl-12 xl:text-base"
                    />
                  </div>
                </label>

                <div className="-mt-1 flex justify-end">
                  <Link
                    href="/forgot-password"
                    className="text-sm font-medium text-[var(--muted)] transition hover:text-[var(--accent)]"
                  >
                    Olvidé mi contraseña
                  </Link>
                </div>

                <div className="flex items-center justify-start gap-4 pt-1">
                  <label className="flex items-center gap-2 text-sm font-medium text-[var(--muted)]">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
                    />
                    Recordarme
                  </label>
                </div>

                <div className="pt-3">
                  <SubmitButton
                    pendingLabel="Ingresando..."
                    className="h-[52px] w-full gap-2 text-[15px] font-bold shadow-[0_8px_24px_rgba(230,18,56,0.26)] xl:h-14 xl:text-base"
                  >
                    Entrar
                    <ArrowRight className="size-5" />
                  </SubmitButton>
                </div>
              </form>
            </div>

            <p className="mt-6 flex items-center justify-center text-center text-sm font-medium text-[var(--muted)] xl:mt-8">
              <a
                href={supportContactHref}
                className="text-[var(--foreground)] underline transition hover:text-[var(--accent)]"
              >
                Contactar a soporte
              </a>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
