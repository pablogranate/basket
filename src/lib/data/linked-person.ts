import { and, eq, isNull } from "drizzle-orm";

import type { PersonRow } from "@/lib/database.types";
import { db } from "@/lib/db/client";
import { people } from "@/lib/db/schema";

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

// Resolves the active `people` row behind a logged-in user. The link is the
// explicit people.profile_id FK, stamped at approval (or by the 0034 backfill);
// exact email is kept as a deterministic fallback for rows whose link the
// backfill could not set. The old normalized-name match is gone — it silently
// handed one collaborator another's jornada.
export async function findLinkedPerson(params: {
  profileId: string | null;
  email: string | null;
}) {
  if (params.profileId) {
    const byProfile = await db
      .select(LINKED_PERSON_COLUMNS)
      .from(people)
      .where(
        and(
          eq(people.profileId, params.profileId),
          eq(people.active, true),
          isNull(people.deletedAt),
        ),
      )
      .limit(1);

    if (byProfile[0]) {
      return {
        person: byProfile[0] as LinkedPerson,
        linkedBy: "profile" as const,
      };
    }
  }

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

  return {
    person: null,
    linkedBy: null,
  };
}
