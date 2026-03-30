import { Radio, UsersRound, Video } from "lucide-react";

import { APP_NAME } from "@/lib/constants";
import { PRODUCT_COPY } from "@/lib/copy";
import { cn } from "@/lib/utils";

type AuthPageShellProps = {
  eyebrow: string;
  title: React.ReactNode;
  description: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  cardClassName?: string;
};

export function AuthPageShell({
  eyebrow,
  title,
  description,
  children,
  footer,
  cardClassName,
}: AuthPageShellProps) {
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

            <div
              className={cn(
                "rounded-[22px] border border-[var(--border)] bg-[var(--surface)] p-7 shadow-[0_12px_34px_rgba(28,13,16,0.05)] sm:p-8 xl:p-9",
                cardClassName,
              )}
            >
              <div className="mb-6 text-center xl:mb-7 lg:text-left">
                <p className="text-xs font-bold uppercase tracking-[0.32em] text-[var(--accent)]">
                  {eyebrow}
                </p>
                <h2 className="mx-auto mt-2.5 max-w-[13rem] text-[1.8rem] font-black leading-[0.94] tracking-tight text-[var(--foreground)] lg:mx-0 lg:max-w-none xl:text-[2rem]">
                  {title}
                </h2>
                <p className="mt-2 text-sm font-medium text-[var(--muted)]">
                  {description}
                </p>
              </div>

              {children}
            </div>

            {footer}
          </div>
        </section>
      </div>
    </div>
  );
}
