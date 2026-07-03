import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Globe, Instagram, Mail, MapPinned, MessageCircle, ShieldAlert, UserRound } from "lucide-react";

import { TeamLogoMark } from "@/components/team-logo-mark";
import { Card } from "@/components/ui/card";
import { getUserContext } from "@/lib/auth";
import { getPeopleContactList } from "@/lib/data/dashboard";
import {
  buildTeamResponsibleLookup,
  getTeamResponsibleContact,
} from "@/lib/team-responsibles";
import { getTeamBySlug, splitTeamCompetitions } from "@/lib/team-directory";
import { buildWhatsAppUrl } from "@/lib/utils";

type PageProps = {
  params: Promise<{ slug: string }>;
};

function getIncidentBadgeClass(incidentCount: number) {
  if (incidentCount >= 4) {
    return "bg-[#fff1f3] text-[#c21e3a]";
  }

  if (incidentCount >= 1) {
    return "bg-[#fff7e8] text-[#c97a13]";
  }

  return "bg-[var(--n-100)] text-[var(--n-500)]";
}

function ExternalLinkItem({
  href,
  label,
  icon,
}: {
  href: string | null;
  label: string;
  icon: React.ReactNode;
}) {
  if (!href) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3 text-sm font-medium text-[var(--n-400)]">
        {icon}
        <span>{label}: sin cargar</span>
      </div>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-soft)]"
    >
      {icon}
      <span>{label}</span>
      <ExternalLink className="ml-auto size-4 text-[var(--accent)]" />
    </a>
  );
}

export default async function TeamDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const team = getTeamBySlug(slug);

  if (!team) {
    notFound();
  }

  const user = await getUserContext();
  const people = user.userId ? await getPeopleContactList(user) : [];
  const responsibleLookup = buildTeamResponsibleLookup(people);
  const responsibleContact = getTeamResponsibleContact(
    team.official_name,
    team.manager,
    responsibleLookup,
  );
  const responsibleLabel =
    responsibleContact?.fullName ?? team.manager ?? "Sin responsable";
  const leagueBadges = splitTeamCompetitions(team.competition);

  return (
    <div className="space-y-8">
      <nav className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--n-400)]">
        <Link href="/teams" className="transition hover:text-[var(--accent)]">
          Equipos
        </Link>
        <span>/</span>
        <span className="text-[var(--n-500)]">{team.official_name}</span>
      </nav>

      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[0_10px_28px_rgba(28,13,16,0.05)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-6">
            <TeamLogoMark
              teamName={team.official_name}
              competition={team.competition}
              className="size-28 rounded-[28px] border-[var(--accent-border)] bg-white shadow-[0_12px_24px_rgba(28,13,16,0.06)]"
              imageClassName="p-4"
              initialsClassName="text-lg tracking-[0.14em]"
            />
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {leagueBadges.map((league) => (
                  <span
                    key={`${team.id}-${league}`}
                    className="inline-flex rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-[var(--accent)]"
                  >
                    {league}
                  </span>
                ))}
              </div>
              <h1 className="font-[family-name:var(--font-oswald)] text-4xl font-bold tracking-tight text-[var(--foreground)]">
                {team.official_name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium text-[var(--n-600)]">
                <span className="flex items-center gap-2">
                  <MapPinned className="size-4" />
                  {team.stadium ?? "Sin estadio cargado"}
                </span>
                <span className="flex items-center gap-2">
                  <UserRound className="size-4" />
                  {responsibleLabel}
                  {responsibleContact?.phone ? (
                    <a
                      href={buildWhatsAppUrl(responsibleContact.phone)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Escribir por WhatsApp a ${responsibleContact.fullName}`}
                      className="inline-flex size-8 items-center justify-center rounded-full bg-[#ecfdf3] text-[#16a34a] transition hover:bg-[#dcfce7]"
                    >
                      <MessageCircle className="size-4" />
                    </a>
                  ) : null}
                  {responsibleContact?.email ? (
                    <a
                      href={`mailto:${responsibleContact.email}`}
                      aria-label={`Escribir por correo a ${responsibleContact.fullName}`}
                      className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] transition hover:bg-[var(--accent-border)]"
                    >
                      <Mail className="size-4" />
                    </a>
                  ) : null}
                </span>
              </div>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${getIncidentBadgeClass(
              team.incident_count,
            )}`}
          >
            <ShieldAlert className="size-4" />
            {team.incident_count} incidencias
          </span>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="space-y-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--n-400)]">
              Resumen operativo
            </p>
            <h2 className="mt-2 text-2xl font-black text-[var(--foreground)]">
              Ficha base del club
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--background-soft)] px-4 py-4">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--n-400)]">
                Nombre oficial
              </p>
              <p className="mt-2 text-base font-bold text-[var(--foreground)]">
                {team.official_name}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--background-soft)] px-4 py-4">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--n-400)]">
                Liga
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {leagueBadges.map((league) => (
                  <span
                    key={`detail-${team.id}-${league}`}
                    className="inline-flex rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-[var(--accent)]"
                  >
                    {league}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--background-soft)] px-4 py-4">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--n-400)]">
                Estadio
              </p>
              <p className="mt-2 text-base font-bold text-[var(--foreground)]">
                {team.stadium ?? "Sin estadio cargado"}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--background-soft)] px-4 py-4">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--n-400)]">
                Responsable
              </p>
              <div className="mt-2 flex items-center gap-2">
                <p className="text-base font-bold text-[var(--foreground)]">
                  {responsibleLabel}
                </p>
                {responsibleContact?.phone ? (
                  <a
                    href={buildWhatsAppUrl(responsibleContact.phone)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Escribir por WhatsApp a ${responsibleContact.fullName}`}
                    className="inline-flex size-8 items-center justify-center rounded-full bg-[#ecfdf3] text-[#16a34a] transition hover:bg-[#dcfce7]"
                  >
                    <MessageCircle className="size-4" />
                  </a>
                ) : null}
                {responsibleContact?.email ? (
                  <a
                    href={`mailto:${responsibleContact.email}`}
                    aria-label={`Escribir por correo a ${responsibleContact.fullName}`}
                    className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] transition hover:bg-[var(--accent-border)]"
                  >
                    <Mail className="size-4" />
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--n-400)]">
              Enlaces oficiales
            </p>
            <h2 className="mt-2 text-xl font-black text-[var(--foreground)]">
              Accesos rápidos
            </h2>
          </div>

          <ExternalLinkItem
            href={team.website}
            label="Web oficial"
            icon={<Globe className="size-4 text-[var(--accent)]" />}
          />
          <ExternalLinkItem
            href={team.instagram}
            label="Instagram"
            icon={<Instagram className="size-4 text-[var(--accent)]" />}
          />
          <ExternalLinkItem
            href={team.official_url}
            label="Liga oficial"
            icon={<ExternalLink className="size-4 text-[var(--accent)]" />}
          />
        </Card>
      </div>
    </div>
  );
}
