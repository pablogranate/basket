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

export type SyncLogEntry =
  Database["public"]["Tables"]["grid_sync_runs"]["Row"];


export type PersonTeamLink = {
  id: string;
  name: string;
};

// A ficha's standing in the portal: its Cuenta's portal role, "revocado" for a
// Cuenta without a portal Acceso, "sin-cuenta" for a ficha nobody logs in as,
// and "desconocido" when the Auth DB could not be read.
export type PersonPortalAccess =
  | AppRole
  | "revocado"
  | "sin-cuenta"
  | "desconocido";

export type PersonListItem = PersonRow & {
  assignment_state: "En asignacion" | "Disponible" | "Inactivo";
  portal_access: PersonPortalAccess;
  current_assignment_count: number;
  functions: PersonFunctionKey[];
  teams: PersonTeamLink[];
};

// No phone/email: the grid ships this list to every visitor. The edit modal
// fetches contacts for the people it notifies (getPeopleContactsAction).
export type GridOwner = Pick<PersonRow, "id" | "full_name"> & {
  functions: PersonFunctionKey[];
};

// Mirrors gridMatchColumns, not the full match row: the /grid loader stops
// selecting the audit and bookkeeping columns, so the type must stop claiming
// they are there. Keep the two in step — the coverage test asserts it.
export type GridMatchFields = Pick<
  MatchRow,
  | "id"
  | "competition"
  | "production_mode"
  | "status"
  | "home_team"
  | "away_team"
  | "venue"
  | "kickoff_at"
  | "duration_minutes"
  | "timezone"
  | "notes"
  | "production_code"
  | "commentary_plan"
  | "transport"
>;

// Slimmed to what the /grid render path actually reads. Every field here is
// multiplied by ~10 assignments per match and ~90 matches in a month window, so
// anything the table, the cards, the export and the edit prefill do not touch
// stays out of the Flight payload. The fat shapes live on AssignmentDetail /
// MatchDetail for /match/[id]. Keep the loader SELECT in step with this.
export type MatchListItem = GridMatchFields & {
  owner: Pick<PersonRow, "id" | "full_name"> | null;
  assignments: Array<{
    role_id: string;
    person_id: string | null;
    confirmed: boolean;
    attendance_response: string | null;
    notes: string | null;
    role: Pick<RoleRow, "name">;
    person: Pick<PersonRow, "id" | "full_name"> | null;
  }>;
};

// Slim projection of a match for the edit modal. The full MatchListItem embeds
// a role + person object on every assignment slot (~21 per match); serializing
// hundreds of those into per-card client components inflated /grid to ~15MB.
// The modal only needs the scalar fields it edits plus a role-name ->
// person-id map, so we ship exactly that and never serialize the rest of the
// match row (audit columns, sync markers) nor the nested role/person graph.
export type MatchEditPrefill = Pick<
  MatchRow,
  | "id"
  | "production_code"
  | "competition"
  | "home_team"
  | "away_team"
  | "kickoff_at"
  | "timezone"
  | "status"
  | "production_mode"
  | "venue"
  | "duration_minutes"
  | "commentary_plan"
  | "transport"
  | "notes"
> & {
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
  actor: Pick<ProfileRow, "id" | "full_name"> | null;
};
