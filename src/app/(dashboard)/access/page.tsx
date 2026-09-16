import Link from "next/link";
import { KeyRound, Users } from "lucide-react";

import { AccesoLevelCell } from "@/components/access/acceso-level-cell";
import { SectionPageHeader } from "@/components/layout/section-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageMessage } from "@/components/ui/page-message";
import { SectionTableCard } from "@/components/ui/section-table-card";
import {
  SIBLING_APP_LABELS,
  SIBLING_APP_LEVEL_HELP,
  SIBLING_APPS,
} from "@/lib/acceso/catalog";
import { requireAdmin } from "@/lib/auth-access";
import { SECTION_COPY } from "@/lib/copy";
import { getAccesosMatrix } from "@/lib/data/accesos";
import { formatMatchDate } from "@/lib/date";
import { getRoleDisplayName } from "@/lib/display";
import { parseNotice } from "@/lib/search-params";
import { cn } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Accesos matrix (ADR 0009): every identity in the Auth DB — with or without a
// Cuenta or Ficha — × the four sibling apps. Admins only: the route prefix is
// denied to productores and requireAdmin refuses anyone else server-side.
export default async function AccessPage({ searchParams }: PageProps) {
  const ctx = await requireAdmin();
  const [resolvedSearchParams, rows] = await Promise.all([
    searchParams,
    getAccesosMatrix(ctx),
  ]);
  const { intent, notice } = parseNotice(resolvedSearchParams);
  // Deep link from a person's Cuenta block: highlight that identity's row.
  const highlightedEmail =
    typeof resolvedSearchParams.email === "string"
      ? resolvedSearchParams.email.toLowerCase()
      : null;

  const grantorNames = new Map(rows.map((row) => [row.userId, row.name || row.email]));

  return (
    <div className="space-y-10">
      <SectionPageHeader
        title={SECTION_COPY.access.title}
        description={SECTION_COPY.access.description}
        actions={
          <Link href="/people">
            <Button variant="secondary" className="gap-2">
              <Users className="size-4" />
              Ir a Personal
            </Button>
          </Link>
        }
      />

      <PageMessage intent={intent} message={notice} />

      <SectionTableCard
        title="Identidades y apps"
        icon={KeyRound}
        badge={<Badge>{rows.length} identidades</Badge>}
      >
        {rows.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="Todavía no hay identidades"
              description="Las personas aparecen acá después de su primer inicio de sesión en el portal."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] text-sm">
              <thead className="bg-[var(--n-50)] text-left text-[11px] font-black uppercase tracking-[0.18em] text-[var(--n-500)]">
                <tr>
                  <th className="px-6 py-4 align-top">Identidad</th>
                  {SIBLING_APPS.map((app) => (
                    <th key={app} className="px-4 py-4 align-top">
                      <div>{SIBLING_APP_LABELS[app]}</div>
                      <p className="mt-1 max-w-[14rem] text-[11px] font-medium normal-case tracking-normal text-[var(--n-500)]">
                        {SIBLING_APP_LEVEL_HELP[app]}
                      </p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--n-100)]">
                {rows.map((row) => (
                  <tr
                    key={row.userId}
                    id={`identity-${row.userId}`}
                    className={cn(
                      "align-top",
                      highlightedEmail === row.email.toLowerCase() &&
                        "bg-[var(--accent-soft)]",
                    )}
                  >
                    <td className="px-6 py-4">
                      <div className="font-semibold text-[var(--foreground)]">
                        {row.name || row.email}
                      </div>
                      <div className="text-xs text-[var(--n-500)]">{row.email}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge>
                          {row.cuentaRole
                            ? `Cuenta: ${getRoleDisplayName(row.cuentaRole)}`
                            : "Sin cuenta en el portal"}
                        </Badge>
                        {row.fichaName ? <Badge>Ficha: {row.fichaName}</Badge> : null}
                      </div>
                    </td>
                    {SIBLING_APPS.map((app) => {
                      const acceso = row.accesos[app];
                      return (
                        <td key={app} className="px-4 py-4">
                          <AccesoLevelCell
                            userId={row.userId}
                            app={app}
                            currentLevel={acceso?.level ?? null}
                          />
                          {acceso ? (
                            <p className="mt-2 text-[11px] text-[var(--n-500)]">
                              {acceso.grantedBy
                                ? `Por ${grantorNames.get(acceso.grantedBy) ?? "admin"}`
                                : "Alta inicial"}{" "}
                              · {formatMatchDate(acceso.grantedAt.toISOString(), undefined, "d MMM yyyy")}
                            </p>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionTableCard>
    </div>
  );
}
