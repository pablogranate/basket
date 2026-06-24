import type {
  AppRole,
  AssignmentRow,
  AuditRow,
  Database,
  MatchRow,
  PersonRow,
  ProfileRow,
  RoleRow,
} from "@/lib/database.types";
import type { PersonFunctionKey } from "@/lib/functions";

export type NotificationLogEntry =
  Database["public"]["Tables"]["notification_logs"]["Row"];

export type UserContext = {
  userId: string | null;
  email: string | null;
  profile: ProfileRow | null;
  role: AppRole;
  canEdit: boolean;
};

export type PersonListItem = PersonRow & {
  primary_role: string | null;
  assignment_state: "En asignacion" | "Disponible" | "Inactivo";
  current_assignment_count: number;
  functions: PersonFunctionKey[];
};

export type GridOwner = Pick<
  PersonRow,
  "id" | "full_name" | "phone" | "email"
> & {
  functions: PersonFunctionKey[];
};

export type MatchListItem = MatchRow & {
  owner: Pick<PersonRow, "id" | "full_name" | "phone"> | null;
  assignments: Array<{
    id: string;
    match_id: string;
    role_id: string;
    person_id: string | null;
    confirmed: boolean;
    attendance_response: string | null;
    attendance_note: string | null;
    notes: string | null;
    role: Pick<RoleRow, "id" | "name" | "category" | "sort_order" | "active">;
    person: Pick<PersonRow, "id" | "full_name" | "phone" | "email"> | null;
  }>;
};

// Slim projection of a match for the edit modal. The full MatchListItem embeds
// a role + person object on every assignment slot (~21 per match); serializing
// hundreds of those into per-card client components inflated /grid to ~15MB.
// The modal only needs scalar match fields plus a role-name -> person-id map,
// so we ship that instead and never serialize the nested role/person graph.
export type MatchEditPrefill = MatchRow & {
  ownerId: string | null;
  assignedPersonByRole: Record<string, string>;
};

export type AssignmentDetail = AssignmentRow & {
  role: Pick<RoleRow, "id" | "name" | "category" | "sort_order" | "active">;
  person: Pick<PersonRow, "id" | "full_name" | "phone" | "email"> | null;
};

export type MatchDetail = MatchRow & {
  owner: Pick<PersonRow, "id" | "full_name" | "phone" | "email"> | null;
  assignments: AssignmentDetail[];
};

export type AuditEntry = AuditRow & {
  actor: Pick<ProfileRow, "id" | "full_name" | "role"> | null;
};
