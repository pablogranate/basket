import { and, eq, ilike, isNull } from "drizzle-orm";

import type { PersonRow } from "@/lib/database.types";
import { db } from "@/lib/db/client";
import { people } from "@/lib/db/schema";
import { normalizeText } from "@/lib/utils";

const LINKED_PERSON_COLUMNS = {
  id: people.id,
  full_name: people.fullName,
  email: people.email,
  phone: people.phone,
  active: people.active,
} as const;

export type LinkedPerson = Pick<
  PersonRow,
  "id" | "full_name" | "email" | "phone" | "active"
>;

// Resolves the active `people` row behind a logged-in user, first by exact
// email then by normalized full name. Shared by mi-jornada (collaborators) and
// attendance confirmation (PRD #7). Kept in its own small module so attendance
// does not pull in the entire collaborators data graph.
export async function findLinkedPerson(params: {
  email: string | null;
  profileName: string | null;
}) {
  if (params.email) {
    const byEmail = await db
      .select(LINKED_PERSON_COLUMNS)
      .from(people)
      .where(
        and(
          eq(people.email, params.email),
          eq(people.active, true),
          isNull(people.deletedAt),
        ),
      )
      .limit(1);

    if (byEmail[0]) {
      return {
        person: byEmail[0] as LinkedPerson,
        linkedBy: "email" as const,
      };
    }
  }

  if (!params.profileName) {
    return {
      person: null,
      linkedBy: null,
    };
  }

  const candidates = await db
    .select(LINKED_PERSON_COLUMNS)
    .from(people)
    .where(
      and(
        eq(people.active, true),
        isNull(people.deletedAt),
        ilike(people.fullName, `%${params.profileName.trim()}%`),
      ),
    );

  const profileName = normalizeText(params.profileName);
  const matched =
    (candidates as LinkedPerson[]).find(
      (person) => normalizeText(person.full_name) === profileName,
    ) ?? null;

  return {
    person: matched,
    linkedBy: matched ? ("name" as const) : null,
  };
}
