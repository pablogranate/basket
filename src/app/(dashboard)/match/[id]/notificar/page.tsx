import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  Clock3,
  Home,
  MapPin,
  Megaphone,
  PencilLine,
} from "lucide-react";
import { notFound } from "next/navigation";

import { MatchNotificationWorkspace } from "@/components/match/match-notification-workspace";
import { SetupPanel } from "@/components/layout/setup-panel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageMessage } from "@/components/ui/page-message";
import { requireUserContext } from "@/lib/auth";
import { getProductionModeLabel } from "@/lib/constants";
import { getMatchDetailData } from "@/lib/data/dashboard";
import { formatMatchDate, formatMatchTime } from "@/lib/date";
import { getRoleDisplayName } from "@/lib/display";
import { isSupabaseConfigured } from "@/lib/env";
import {
  buildBulkMatchNotificationMailtoHref,
  buildMatchNotificationMailtoHref,
  buildMatchNotificationMessage,
  buildMatchNotificationWhatsAppHref,
} from "@/lib/integrations";
import { parseNotice } from "@/lib/search-params";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type NotificationRecipient = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  roles: string[];
  emailHref: string;
  whatsappHref: string;
  personalMessage: string;
};

function getRecipientKey(params: {
  personId: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  roleName: string;
}) {
  return (
    params.personId ??
    params.email?.trim().toLowerCase() ??
    params.phone?.trim() ??
    `${params.fullName ?? "sin-asignar"}-${params.roleName}`
  );
}

export default async function MatchNotifyPage({ params, searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const { intent, notice } = parseNotice(resolvedSearchParams);

  if (!isSupabaseConfigured) {
    return <SetupPanel />;
  }

  const user = await requireUserContext();

  if (!user.canEdit) {
    return (
      <Card className="space-y-3 border-[#f2d8ae] bg-[#fffaf0]">
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#9a5a0f]">
          Sin acceso
        </p>
        <h2 className="text-2xl font-black tracking-tight text-[var(--foreground)]">
          Esta pantalla es solo para coordinación
        </h2>
        <p className="text-sm leading-6 text-[var(--n-600)]">
          Necesitas permisos de edición para enviar convocatorias desde el portal.
        </p>
      </Card>
    );
  }

  const { id } = await params;
  let data: Awaited<ReturnType<typeof getMatchDetailData>>;

  try {
    data = await getMatchDetailData(user, id);
  } catch {
    notFound();
  }

  const { match } = data;
  const recipientsMap = new Map<string, NotificationRecipient>();
  const unassignedRoles = match.assignments
    .filter((assignment) => !assignment.person_id)
    .map((assignment) => getRoleDisplayName(assignment.role.name));

  match.assignments
    .filter((assignment) => assignment.person)
    .forEach((assignment) => {
      const person = assignment.person!;
      const roleLabel = getRoleDisplayName(assignment.role.name);
      const key = getRecipientKey({
        personId: person.id,
        fullName: person.full_name,
        email: person.email,
        phone: person.phone,
        roleName: roleLabel,
      });
      const existing = recipientsMap.get(key);

      if (existing) {
        if (!existing.roles.includes(roleLabel)) {
          existing.roles.push(roleLabel);
        }
        return;
      }

      recipientsMap.set(key, {
        id: key,
        fullName: person.full_name,
        email: person.email,
        phone: person.phone,
        roles: [roleLabel],
        emailHref: "",
        whatsappHref: "",
        personalMessage: "",
      });
    });

  const recipients = [...recipientsMap.values()]
    .map((recipient) => {
      const personalMessage = buildMatchNotificationMessage({
        match,
        personName: recipient.fullName,
        roleNames: recipient.roles,
      });

      return {
        ...recipient,
        emailHref: buildMatchNotificationMailtoHref({
          email: recipient.email,
          match,
          personName: recipient.fullName,
          roleNames: recipient.roles,
        }),
        whatsappHref: buildMatchNotificationWhatsAppHref({
          phone: recipient.phone,
          match,
          personName: recipient.fullName,
          roleNames: recipient.roles,
        }),
        personalMessage,
      };
    })
    .sort((left, right) => left.fullName.localeCompare(right.fullName));

  const batchMessage = buildMatchNotificationMessage({ match });
  const bulkMailtoHref = buildBulkMatchNotificationMailtoHref({
    emails: recipients.map((recipient) => recipient.email).filter(Boolean) as string[],
    match,
  });

  return (
    <div className="space-y-8">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          href="/grid"
          className="inline-flex items-center gap-1.5 font-medium text-[var(--muted)] transition hover:text-[var(--accent)]"
        >
          <Home className="size-4" />
          Inicio
        </Link>
        <ChevronRight className="size-4 text-[var(--n-300)]" />
        <Link
          href="/grid"
          className="font-medium text-[var(--muted)] transition hover:text-[var(--accent)]"
        >
          Producción
        </Link>
        <ChevronRight className="size-4 text-[var(--n-300)]" />
        <Link
          href={`/match/${match.id}`}
          className="font-medium text-[var(--muted)] transition hover:text-[var(--accent)]"
        >
          Detalle de partido
        </Link>
        <ChevronRight className="size-4 text-[var(--n-300)]" />
        <span className="font-semibold text-[var(--foreground)]">Notificar</span>
      </nav>

      <section className="panel-surface relative overflow-hidden border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="absolute inset-y-0 right-0 w-72 bg-gradient-to-l from-[rgba(227,27,35,0.06)] to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]">
                {match.production_code ?? "Sin ID"}
              </Badge>
              <Badge>{match.competition ?? "Sin liga"}</Badge>
              <Badge>{getProductionModeLabel(match.production_mode) || "Sin definir"}</Badge>
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--accent)]">
                Notificar
              </p>
              <h1 className="font-[family-name:var(--font-oswald)] mt-2 text-3xl font-bold tracking-[-0.03em] text-[var(--foreground)] sm:text-4xl">
                {match.home_team} vs {match.away_team}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium text-[var(--muted)] sm:text-base">
              <div className="flex items-center gap-1.5">
                <CalendarDays className="size-4" />
                {formatMatchDate(match.kickoff_at, match.timezone, "dd MMM yyyy")}
              </div>
              <div className="flex items-center gap-1.5">
                <Clock3 className="size-4" />
                {formatMatchTime(match.kickoff_at, match.timezone)} {match.timezone}
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="size-4" />
                {match.venue ?? "Sede sin definir"}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Link
              href={`/match/${match.id}`}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--background-soft)]"
            >
              <PencilLine className="size-4" />
              Volver al partido
            </Link>
            <Link
              href="/grid"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--accent-border)]"
            >
              <Megaphone className="size-4" />
              Ir a Producción
            </Link>
          </div>
        </div>
      </section>

      <PageMessage intent={intent} message={notice} />

      <MatchNotificationWorkspace
        batchMessage={batchMessage}
        bulkMailtoHref={bulkMailtoHref}
        recipients={recipients}
        unassignedRoles={unassignedRoles}
      />
    </div>
  );
}
