import { getRoleDisplayName } from "@/lib/display";

export type AssignmentRecipientRow = {
  role: { name: string } | null;
  person: {
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
  } | null;
};

export type MatchRecipient = {
  personId: string;
  personName: string;
  phone: string | null;
  email: string | null;
  roleNames: string[];
};

// Resolve a match's assignment rows into one recipient per person, collecting
// each person's role display names and their phone/email presence. Shared by
// the automatic match-day send and the manual "send to all" action.
export function buildMatchRecipients(
  rows: AssignmentRecipientRow[],
): MatchRecipient[] {
  const byPerson = new Map<string, MatchRecipient>();

  for (const row of rows) {
    const person = row.person;
    if (!person) {
      continue;
    }

    const roleName = getRoleDisplayName(row.role?.name ?? "");
    const existing = byPerson.get(person.id);

    if (existing) {
      if (roleName && !existing.roleNames.includes(roleName)) {
        existing.roleNames.push(roleName);
      }
      continue;
    }

    byPerson.set(person.id, {
      personId: person.id,
      personName: person.full_name,
      phone: person.phone?.trim() || null,
      email: person.email?.trim() || null,
      roleNames: roleName ? [roleName] : [],
    });
  }

  return [...byPerson.values()];
}
