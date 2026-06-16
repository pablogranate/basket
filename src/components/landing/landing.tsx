import { AlertTriangle, BarChart3, Clapperboard } from "lucide-react";

import { LandingLogoutClient } from "@/components/landing/landing-logout-client";
import { Card } from "@/components/ui/card";
import { APP_NAME, buildSiblingAppUrl } from "@/lib/constants";

type LandingApp = {
  subdomain: string;
  name: string;
  description: string;
  Icon: typeof Clapperboard;
};

const LANDING_APPS: LandingApp[] = [
  {
    subdomain: "portal",
    name: "Producción",
    description:
      "Coordiná la jornada, asigná roles y supervisá la operación del día.",
    Icon: Clapperboard,
  },
  {
    subdomain: "analytics",
    name: "Analytics",
    description: "Tableros y métricas de datos de las transmisiones.",
    Icon: BarChart3,
  },
  {
    subdomain: "incidencias",
    name: "Incidencias",
    description: "Reportá y seguí el estado de las incidencias técnicas.",
    Icon: AlertTriangle,
  },
];

export function Landing({
  host,
  userEmail,
}: {
  host: string;
  userEmail: string | null;
}) {
  const loginUrl = `${buildSiblingAppUrl(host, "portal")}/login`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-lg font-black tracking-tight text-[var(--foreground)]">
            {APP_NAME}
          </span>
          {userEmail ? (
            <span className="text-sm text-[var(--muted)]">
              {userEmail}
            </span>
          ) : null}
        </div>
        <LandingLogoutClient loginUrl={loginUrl} />
      </header>

      <div className="mt-12">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">
          Elegí una aplicación
        </h1>
        <p className="mt-1 text-[var(--muted)]">
          Acceso unificado a las herramientas de {APP_NAME}.
        </p>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {LANDING_APPS.map(({ subdomain, name, description, Icon }) => (
          <a
            key={subdomain}
            href={buildSiblingAppUrl(host, subdomain)}
            className="group block focus:outline-none"
          >
            <Card className="h-full transition group-hover:border-[var(--accent)] group-focus-visible:border-[var(--accent)]">
              <Icon
                className="size-8 text-[var(--accent)]"
                strokeWidth={1.5}
                aria-hidden
              />
              <h2 className="mt-4 text-lg font-bold text-[var(--foreground)]">
                {name}
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {description}
              </p>
            </Card>
          </a>
        ))}
      </div>
    </main>
  );
}
