"use client";

import { useRef, type CSSProperties } from "react";
import Image from "next/image";
import { Check, Mail, MessageCircle } from "lucide-react";

import { ClientTeamLogoMark } from "@/components/team-logo-mark-client";
import { TeamCardIcon } from "@/components/teams/team-card-icon-sprite";
import { CreateTeamModal } from "@/components/teams/create-team-modal-lazy";
import type { TeamResponsibleContact } from "@/lib/team-responsibles";
import {
  getTeamLeagueAccentColor,
  getTeamLeagueColorSet,
  getTeamLeagueLabel,
  splitTeamCompetitions,
  type TeamDirectoryItem,
} from "@/lib/team-directory";
import {
  beginTeamCardDrag,
  TEAM_DRAG_MIME,
  type TeamDragPayload,
} from "@/lib/team-drag";
import { buildWhatsAppUrl, cn } from "@/lib/utils";

// Present only while /teams is in edit mode.
export type TeamCardSelection = {
  selected: boolean;
  dimmed: boolean;
  onToggle: () => void;
  // The teams this drag carries: the selected group.
  onDragTeams: () => TeamDragPayload[];
  onDragDone: () => void;
};

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
  selection,
}: {
  team: TeamDirectoryItem;
  activeLeague?: string;
  responsibleContact?: TeamResponsibleContact | null;
  canEdit?: boolean;
  selection?: TeamCardSelection;
}) {
  // Only a selected card drags (carrying the group); pressing anything else
  // starts the lasso instead.
  const draggable = canEdit && Boolean(selection?.selected);
  const cardRef = useRef<HTMLElement | null>(null);
  const endDragRef = useRef<(() => void) | null>(null);
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
      className={cn(
        "panel-surface group tc-card",
        selection && "relative cursor-pointer select-none",
        selection?.selected &&
          "border-[var(--accent)] ring-2 ring-[var(--accent)]",
        selection?.dimmed && "opacity-40",
      )}
      data-team-card-id={team.id}
      ref={cardRef}
      draggable={draggable}
      onClick={
        selection
          ? (event) => {
              const target = event.target as HTMLElement;
              // Portaled modals bubble through React; links/buttons keep their job.
              if (
                !event.currentTarget.contains(target) ||
                target.closest("a, button")
              ) {
                return;
              }
              selection.onToggle();
            }
          : undefined
      }
      onDragStart={
        draggable
          ? (event) => {
              const teams = selection!.onDragTeams();
              event.dataTransfer.setData(TEAM_DRAG_MIME, JSON.stringify(teams));
              event.dataTransfer.effectAllowed = "copyMove";

              if (cardRef.current) {
                endDragRef.current = beginTeamCardDrag(
                  event,
                  cardRef.current,
                  teams.length,
                );
              }
            }
          : undefined
      }
      onDragEnd={
        draggable
          ? () => {
              endDragRef.current?.();
              endDragRef.current = null;
              selection!.onDragDone();
            }
          : undefined
      }
    >
      {selection ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute left-3 top-3 z-20 grid size-5 place-items-center rounded-full border-2 bg-white transition",
            selection.selected
              ? "border-[var(--accent)] bg-[var(--accent)] text-white"
              : "border-[var(--n-300)] group-hover:border-[var(--n-500)]",
          )}
        >
          {selection.selected ? <Check className="size-3" strokeWidth={3} /> : null}
        </span>
      ) : null}
      <div className="tc-logo-col">
        {team.logo_src ? (
          <div className="panel-surface tc-logo overflow-hidden">
            <Image
              src={team.logo_src}
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
                  title={league}
                >
                  <span>{getTeamLeagueLabel(league)}</span>
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
            {team.short_name ? (
              <span className="tc-team-siglas">{team.short_name}</span>
            ) : null}
          </h3>

          <div className="tc-meta">
            {team.city || team.province ? (
              <div className="tc-row">
                <TeamCardIcon name="map-pinned" className="size-4 shrink-0" />
                <span className="min-w-0 truncate">
                  {[team.city, team.province].filter(Boolean).join(", ")}
                </span>
              </div>
            ) : null}
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
