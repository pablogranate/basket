import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Clapperboard,
  Image as ImageIcon,
  Radio,
  Receipt,
} from "lucide-react";

import { LandingLogoutClient } from "@/components/landing/landing-logout-client";
import { Card } from "@/components/ui/card";
import { SIBLING_APP_LABELS, type LauncherApp } from "@/lib/acceso/catalog";
import { buildSiblingAppUrl } from "@/lib/constants";

type LandingApp = {
  subdomain: string;
  name: string;
  Icon: typeof Clapperboard;
};

// Subdomains are not always the app key: the ops hub lives at op.
const LANDING_APPS: Record<LauncherApp, LandingApp> = {
  portal: { subdomain: "portal", name: "Producción", Icon: Clapperboard },
  analytics: {
    subdomain: "analytics",
    name: SIBLING_APP_LABELS.analytics,
    Icon: BarChart3,
  },
  incidencias: {
    subdomain: "incidencias",
    name: SIBLING_APP_LABELS.incidencias,
    Icon: AlertTriangle,
  },
  generator: {
    subdomain: "generator",
    name: SIBLING_APP_LABELS.generator,
    Icon: ImageIcon,
  },
  ops: { subdomain: "op", name: SIBLING_APP_LABELS.ops, Icon: Radio },
  facturacion: {
    subdomain: "facturacion",
    name: SIBLING_APP_LABELS.facturacion,
    Icon: Receipt,
  },
};

export function Landing({
  host,
  userEmail,
  apps,
}: {
  host: string;
  userEmail: string | null;
  apps: LauncherApp[];
}) {
  const loginUrl = `${buildSiblingAppUrl(host, "portal")}/login`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-8">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/Basket.tv horizontal rojo.png"
          alt="Basquetpass"
          className="h-8 w-auto max-w-[160px] object-contain object-left select-none"
        />
        <div className="flex items-center gap-4">
          {userEmail ? (
            <span className="hidden text-sm text-[var(--muted)] sm:inline">
              {userEmail}
            </span>
          ) : null}
          <LandingLogoutClient loginUrl={loginUrl} />
        </div>
      </header>

      <div className="mt-14">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)]">
          Elegí una aplicación
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Acceso unificado a las herramientas de Basquetpass.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {apps.map((app) => LANDING_APPS[app]).map(({ subdomain, name, Icon }) => (
          <a
            key={subdomain}
            href={buildSiblingAppUrl(host, subdomain)}
            className="group block rounded-[var(--panel-radius)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          >
            <Card className="flex h-full items-center gap-4 transition-colors duration-200 group-hover:border-[var(--accent)]">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-[var(--panel-radius)] bg-[var(--accent-soft)] text-[var(--accent)]">
                <Icon className="size-6" strokeWidth={1.75} aria-hidden />
              </span>
              <h2 className="flex-1 text-base font-bold text-[var(--foreground)]">
                {name}
              </h2>
              <ArrowUpRight
                className="size-5 text-[var(--n-400)] transition group-hover:text-[var(--accent)]"
                aria-hidden
              />
            </Card>
          </a>
        ))}
      </div>
    </main>
  );
}
