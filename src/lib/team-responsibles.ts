import { parsePersonNotesMeta } from "@/lib/people-notes";
import type { PersonListItem } from "@/lib/types";
import { normalizeText } from "@/lib/utils";

export type TeamResponsibleContact = {
  fullName: string;
  phone: string | null;
  email: string | null;
};

type TeamResponsibleLookup = {
  byTeam: Map<string, TeamResponsibleContact>;
  byName: Map<string, TeamResponsibleContact>;
};

export function splitCoverageTeams(value: string) {
  return value
    .split(/[,\n;|]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeManagerValue(value: string | null | undefined) {
  const normalized = normalizeText(value);

  if (!normalized || normalized.includes("por asignar")) {
    return "";
  }

  return normalized;
}

export function buildTeamResponsibleLookup(
  people: PersonListItem[],
): TeamResponsibleLookup {
  const byTeam = new Map<string, TeamResponsibleContact>();
  const byName = new Map<string, TeamResponsibleContact>();
  const orderedPeople = [...people].sort(
    (left, right) => Number(right.active) - Number(left.active),
  );

  orderedPeople.forEach((person) => {
    const contact = {
      fullName: person.full_name,
      phone: person.phone,
      email: person.email,
    } satisfies TeamResponsibleContact;
    const normalizedName = normalizeText(person.full_name);

    if (normalizedName && !byName.has(normalizedName)) {
      byName.set(normalizedName, contact);
    }

    const meta = parsePersonNotesMeta(person.notes);
    splitCoverageTeams(meta.coverage).forEach((teamName) => {
      const normalizedTeam = normalizeText(teamName);

      if (normalizedTeam && !byTeam.has(normalizedTeam)) {
        byTeam.set(normalizedTeam, contact);
      }
    });
  });

  return {
    byTeam,
    byName,
  };
}

export function getTeamResponsibleContact(
  teamName: string,
  fallbackManager: string | null | undefined,
  lookup: TeamResponsibleLookup,
) {
  const byTeam = lookup.byTeam.get(normalizeText(teamName));

  if (byTeam) {
    return byTeam;
  }

  const normalizedManager = normalizeManagerValue(fallbackManager);

  return normalizedManager ? lookup.byName.get(normalizedManager) ?? null : null;
}
