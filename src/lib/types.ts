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


export type UserContext = {
  userId: string | null;
  email: string | null;
  profile: ProfileRow | null;
  role: AppRole;
  canEdit: boolean;
};

export type PersonTeamLink = {
  id: string;
  name: string;
};

export type PersonListItem = PersonRow & {
  assignment_state: "En asignacion" | "Disponible" | "Inactivo";
  current_assignment_count: number;
  functions: PersonFunctionKey[];
  teams: PersonTeamLink[];
};

export type GridOwner = Pick<
  PersonRow,
  "id" | "full_name" | "phone" | "email"
> & {
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
  actor: Pick<ProfileRow, "id" | "full_name" | "role"> | null;
};

export type MatchReportIncidentLevel = "sin" | "baja" | "alta" | "critica";

export type MatchCollaboratorReport = {
  id: string;
  incidentLevel: MatchReportIncidentLevel;
  roleName: string | null;
  reporterName: string | null;
  signalLabel: string;
  aptoLineal: boolean;
  feedDetected: boolean;
  testTime: string | null;
  testCheck: boolean;
  soundCheck: boolean;
  graphicsCheck: boolean;
  internetCheck: boolean;
  cameraCheck: boolean;
  speedtestValue: string | null;
  pingValue: string | null;
  gpuValue: string | null;
  generalObservations: string | null;
  problems: Record<string, boolean>;
  submittedAt: string;
};
