// Snake_case column projections that reproduce supabase-js `select("*")` result
// shapes. Drizzle's default select keys the result by schema property name
// (camelCase); the app-facing Row types (database.types.ts) and view models use
// snake_case, so every full-row loader selects through one of these maps.
import {
  assignments,
  auditLog,
  gridSyncRuns,
  matches,
  notificationLogs,
  people,
  roles,
} from "@/lib/db/schema";

export const matchColumns = {
  id: matches.id,
  competition: matches.competition,
  production_mode: matches.productionMode,
  status: matches.status,
  home_team: matches.homeTeam,
  away_team: matches.awayTeam,
  venue: matches.venue,
  kickoff_at: matches.kickoffAt,
  duration_minutes: matches.durationMinutes,
  timezone: matches.timezone,
  owner_id: matches.ownerId,
  notes: matches.notes,
  created_at: matches.createdAt,
  updated_at: matches.updatedAt,
  created_by: matches.createdBy,
  updated_by: matches.updatedBy,
  production_code: matches.productionCode,
  commentary_plan: matches.commentaryPlan,
  transport: matches.transport,
  day_notified_at: matches.dayNotifiedAt,
  league_id: matches.leagueId,
} as const;

export const peopleColumns = {
  id: people.id,
  full_name: people.fullName,
  phone: people.phone,
  email: people.email,
  active: people.active,
  notes: people.notes,
  created_at: people.createdAt,
  updated_at: people.updatedAt,
  created_by: people.createdBy,
  updated_by: people.updatedBy,
  category: people.category,
  role_id: people.roleId,
} as const;

export const roleColumns = {
  id: roles.id,
  name: roles.name,
  category: roles.category,
  sort_order: roles.sortOrder,
  active: roles.active,
  created_at: roles.createdAt,
  updated_at: roles.updatedAt,
  created_by: roles.createdBy,
  updated_by: roles.updatedBy,
} as const;

export const assignmentColumns = {
  id: assignments.id,
  match_id: assignments.matchId,
  role_id: assignments.roleId,
  person_id: assignments.personId,
  confirmed: assignments.confirmed,
  notes: assignments.notes,
  created_at: assignments.createdAt,
  updated_at: assignments.updatedAt,
  created_by: assignments.createdBy,
  updated_by: assignments.updatedBy,
  attendance_confirmed_at: assignments.attendanceConfirmedAt,
  attendance_response: assignments.attendanceResponse,
  attendance_note: assignments.attendanceNote,
} as const;

export const auditLogColumns = {
  id: auditLog.id,
  table_name: auditLog.tableName,
  record_id: auditLog.recordId,
  match_id: auditLog.matchId,
  action: auditLog.action,
  changed_by: auditLog.changedBy,
  before: auditLog.before,
  after: auditLog.after,
  created_at: auditLog.createdAt,
} as const;

export const gridSyncRunColumns = {
  id: gridSyncRuns.id,
  trigger: gridSyncRuns.trigger,
  status: gridSyncRuns.status,
  created_count: gridSyncRuns.createdCount,
  updated_count: gridSyncRuns.updatedCount,
  skipped_count: gridSyncRuns.skippedCount,
  assignments_upserted: gridSyncRuns.assignmentsUpserted,
  assignments_deleted: gridSyncRuns.assignmentsDeleted,
  people_created: gridSyncRuns.peopleCreated,
  error: gridSyncRuns.error,
  started_at: gridSyncRuns.startedAt,
  finished_at: gridSyncRuns.finishedAt,
  deleted_count: gridSyncRuns.deletedCount,
} as const;

export const notificationLogColumns = {
  id: notificationLogs.id,
  created_at: notificationLogs.createdAt,
  match_id: notificationLogs.matchId,
  person_id: notificationLogs.personId,
  match_label: notificationLogs.matchLabel,
  recipient_name: notificationLogs.recipientName,
  role_names: notificationLogs.roleNames,
  channel: notificationLogs.channel,
  destination: notificationLogs.destination,
  status: notificationLogs.status,
  error: notificationLogs.error,
  trigger: notificationLogs.trigger,
} as const;
