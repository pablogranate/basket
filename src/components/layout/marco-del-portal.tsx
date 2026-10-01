"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Marco, type EnlaceDeNavegacion } from "basket-tv-ui";
import {
  BriefcaseBusiness,
  CalendarDays,
  CircleHelp,
  ClipboardList,
  ListOrdered,
  ScrollText,
  Settings2,
  Shield,
  Users,
} from "lucide-react";

import type { AppRole } from "@/lib/database.types";
import {
  APP_PORTAL_LABEL,
  isDashboardNavHrefAllowedForRole,
} from "@/lib/constants";

const navItems = [
  { href: "/grid", label: "Producción", icon: CalendarDays },
  { href: "/fixtures", label: "Fixtures", icon: ListOrdered },
  { href: "/mi-jornada", label: "Mi jornada", icon: ClipboardList },
  { href: "/reports", label: "Operaciones", icon: BriefcaseBusiness },
  { href: "/teams", label: "Equipos", icon: Shield },
  { href: "/people", label: "Personal", icon: Users },
  // Points straight at the destination: /notifications only redirects here, so
  // linking to it warmed the redirect stub instead of the page. `activePrefix`
  // keeps the whole section highlighted (syncs, sync-people).
  {
    href: "/notifications/logs",
    activePrefix: "/notifications",
    label: "Registros",
    icon: ScrollText,
  },
  { href: "/settings", label: "Configuración", icon: Settings2 },
  { href: "/support", label: "Soporte", icon: CircleHelp },
] as const;

type NavItem = (typeof navItems)[number];

function getNavPrefix(item: NavItem) {
  return "activePrefix" in item ? item.activePrefix : item.href;
}

function isNavItemAllowed(item: NavItem, role: AppRole | null | undefined) {
  return isDashboardNavHrefAllowedForRole(getNavPrefix(item), role);
}

export function MarcoDelPortal({
  children,
  role,
  lanzadorUrl,
  cabecera,
}: {
  children: React.ReactNode;
  role: AppRole | null;
  lanzadorUrl: string | null;
  cabecera: React.ReactNode;
}) {
  const pathname = usePathname();
  const secciones: EnlaceDeNavegacion[] = navItems
    .filter((item) => isNavItemAllowed(item, role))
    .map((item) => {
      const Icon = item.icon;

      return {
        clave: item.href,
        titulo: item.label,
        icono: <Icon strokeWidth={2.2} />,
        href: item.href,
        activa: pathname.startsWith(getNavPrefix(item)),
      };
    });

  return (
    <div className="min-h-screen bg-[var(--page-canvas)]">
      <Marco
        nombreDeApp={APP_PORTAL_LABEL}
        secciones={secciones}
        lanzadorUrl={lanzadorUrl}
        cabecera={cabecera}
        ancho="amplio"
        enlace={Link}
      >
        {children}
      </Marco>
    </div>
  );
}
