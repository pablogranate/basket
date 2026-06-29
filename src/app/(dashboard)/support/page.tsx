import Link from "next/link";
import { CircleHelp, Clock3, LifeBuoy, Mail } from "lucide-react";

import { Card } from "@/components/ui/card";

const SUPPORT_EMAIL = "soporte@dashboardproduccion.local";

export default function SupportPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="font-[family-name:var(--font-oswald)] text-4xl font-bold tracking-tight text-[var(--foreground)]">
          Soporte
        </h2>
        <p className="max-w-2xl text-sm font-medium text-[var(--n-600)]">
          Contacta al equipo técnico si tienes problemas de acceso, errores en la
          consola o bloqueos operativos durante una transmisión.
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
        <Card className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="inline-flex size-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <LifeBuoy className="size-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-[var(--foreground)]">
                Mesa de ayuda operativa
              </h3>
              <p className="text-sm text-[var(--n-600)]">
                Usa este canal cuando algo te impida seguir operando.
              </p>
            </div>
          </div>

          <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-4">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--n-400)]">
              <Mail className="size-4 text-[var(--accent)]" />
              Correo de soporte
            </div>
            <p className="mt-2 text-base font-extrabold text-[var(--foreground)]">
              {SUPPORT_EMAIL}
            </p>
          </div>

          <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--n-400)]">
              Qué incluir en tu mensaje
            </p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--n-600)]">
              <li>Nombre del partido o módulo afectado.</li>
              <li>Qué estabas intentando hacer cuando falló.</li>
              <li>Captura o mensaje de error si lo tienes.</li>
              <li>Urgencia operativa y hora del incidente.</li>
            </ul>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`mailto:${SUPPORT_EMAIL}?subject=Soporte%20Basket%20Production`}
              className="inline-flex h-[52px] items-center justify-center gap-2 rounded-[var(--panel-radius)] bg-[var(--accent)] px-5 text-sm font-extrabold text-white shadow-[0_14px_28px_rgba(227,27,35,0.18)] transition hover:bg-[var(--accent-strong)]"
            >
              <Mail className="size-4" />
              Contactar soporte
            </Link>
          </div>
        </Card>

        <Card className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="inline-flex size-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <CircleHelp className="size-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-[var(--foreground)]">
                Prioridad
              </h3>
              <p className="text-sm text-[var(--n-600)]">
                Guía rápida para escalar mejor.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-[var(--panel-radius)] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-4">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">
                Crítico
              </p>
              <p className="mt-2 text-sm font-medium text-[#7b4251]">
                Fuera de aire, bloqueo de acceso o datos operativos imposibles de cargar.
              </p>
            </div>

            <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-4">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--n-400)]">
                <Clock3 className="size-4 text-[var(--accent)]" />
                Tiempo objetivo
              </div>
              <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">
                Respuesta inicial durante operación en curso.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
