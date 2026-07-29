import type { CSSProperties } from "react";
import Image from "next/image";
import { Mail, MessageCircle } from "lucide-react";

import { ClientTeamLogoMark } from "@/components/team-logo-mark-client";
import { TeamCardIcon } from "@/components/teams/team-card-icon-sprite";
import { CreateTeamModal } from "@/components/teams/create-team-modal-lazy";
import type { TeamResponsibleContact } from "@/lib/team-responsibles";
import {
  getTeamLeagueAccentColor,
  getTeamLeagueColorSet,
  splitTeamCompetitions,
  type TeamDirectoryItem,
} from "@/lib/team-directory";
import { buildWhatsAppUrl } from "@/lib/utils";

function getLeagueBadgeStyle(competition: string): CSSProperties {
  const colors = getTeamLeagueColorSet(competition);

  return {
    backgroundColor: colors.soft,
    color: colors.accent,
  };
}

function getIncidentBadgeClass(incidentCount: number) {
  if (incidentCount >= 4) {
    return "tc-incident-alert";
  }

  if (incidentCount >= 1) {
    return "tc-incident-warn";
  }

  return "tc-incident-none";
}

function TeamLinkIcon({
  href,
  children,
}: {
  href: string | null;
  children: React.ReactNode;
}) {
  if (!href) {
    return (
      <span className="tc-link-off">
        {children}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="tc-link-on"
    >
      {children}
    </a>
  );
}

export function TeamCard({
  team,
  activeLeague,
  responsibleContact,
  canEdit = false,
}: {
  team: TeamDirectoryItem;
  activeLeague?: string;
  responsibleContact?: TeamResponsibleContact | null;
  canEdit?: boolean;
}) {
  const leagueBadges = splitTeamCompetitions(team.competition);
  const primaryLeague = activeLeague || leagueBadges[0] || team.competition;
  const hoverAccent = getTeamLeagueAccentColor(primaryLeague);
  const responsibleLabel =
    responsibleContact?.fullName ?? team.manager ?? "Sin responsable";

  return (
    <article
      style={
        {
          "--team-league-accent": hoverAccent,
        } as CSSProperties
      }
      className="panel-surface group tc-card"
    >
      <div className="tc-logo-col">
        {team.logo_data_url ? (
          <div className="panel-surface tc-logo overflow-hidden">
            <Image
              src={team.logo_data_url}
              alt={`Escudo de ${team.official_name}`}
              fill
              unoptimized
              sizes="112px"
              className="object-contain p-3"
            />
          </div>
        ) : (
          <ClientTeamLogoMark
            teamName={team.official_name}
            competition={team.competition}
            className="panel-surface tc-logo"
            imageClassName="p-3"
            initialsClassName="text-sm tracking-[0.14em]"
          />
        )}

        <div className="tc-links">
          <TeamLinkIcon href={team.website}>
            <TeamCardIcon name="globe" className="size-4" />
          </TeamLinkIcon>
          <TeamLinkIcon href={team.instagram}>
            <TeamCardIcon name="instagram" className="size-4" />
          </TeamLinkIcon>
          <TeamLinkIcon href={team.official_url}>
            <TeamCardIcon name="external-link" className="size-4" />
          </TeamLinkIcon>
        </div>
      </div>

      <div className="tc-body">
        <div>
          <div className="tc-head-row">
            <div className="tc-league-row">
              {leagueBadges.map((league) => (
                <span
                  key={`${team.id}-${league}`}
                  style={getLeagueBadgeStyle(league)}
                  className="tc-league-badge"
                >
                  {league}
                </span>
              ))}
            </div>
            <div className="tc-row">
              <span
                className={getIncidentBadgeClass(team.incident_count)}
              >
                <TeamCardIcon name="shield-alert" className="size-3.5" />
                {team.incident_count}
              </span>
              {canEdit ? (
                <CreateTeamModal
                  canEdit={canEdit}
                  defaultCompetition={activeLeague || team.competition}
                  initialTeam={team}
                  triggerVariant="icon"
                  triggerClassName="h-[26px] min-w-[26px] px-2.5 py-1"
                />
              ) : null}
            </div>
          </div>

          <h3 className="tc-team-name">
            {team.official_name}
          </h3>

          <div className="tc-meta">
            <div className="tc-row">
              <TeamCardIcon name="map-pinned" className="size-4 shrink-0" />
              <span>{team.stadium ?? "Sin estadio cargado"}</span>
            </div>
            <div className="tc-row">
              <TeamCardIcon name="user-round" className="size-4 shrink-0" />
              <span className="min-w-0 truncate">{responsibleLabel}</span>
              {responsibleContact?.phone ? (
                <a
                  href={buildWhatsAppUrl(responsibleContact.phone)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Escribir por WhatsApp a ${responsibleContact.fullName}`}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#ecfdf3] text-[#16a34a] transition hover:bg-[#dcfce7]"
                >
                  <MessageCircle className="size-4" />
                </a>
              ) : null}
              {responsibleContact?.email ? (
                <a
                  href={`mailto:${responsibleContact.email}`}
                  aria-label={`Escribir por correo a ${responsibleContact.fullName}`}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] transition hover:bg-[var(--accent-border)]"
                >
                  <Mail className="size-4" />
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
