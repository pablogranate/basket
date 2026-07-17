import { pgTable, uniqueIndex, uuid, text, index, foreignKey, boolean, check, bigint, jsonb, integer, unique, date, primaryKey, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { timestamptz } from "@/lib/db/columns"

export const appRole = pgEnum("app_role", ['admin', 'editor', 'viewer', 'coordinator', 'collaborator'])
export const matchStatus = pgEnum("match_status", ['Pendiente', 'Confirmado', 'Realizado'])


export const profiles = pgTable("profiles", {
	id: uuid().primaryKey().notNull(),
	fullName: text("full_name"),
	role: appRole().default('viewer').notNull(),
	createdAt: timestamptz("created_at").default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamptz("updated_at").default(sql`timezone('utc'::text, now())`).notNull(),
	email: text().notNull(),
	authUserId: text("auth_user_id"),
}, (table) => [
	uniqueIndex("profiles_auth_user_id_key").using("btree", table.authUserId.asc().nullsLast()),
	uniqueIndex("profiles_email_lower_key").using("btree", sql`lower(email)`),
]);

export const people = pgTable("people", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	fullName: text("full_name").notNull(),
	phone: text(),
	email: text(),
	active: boolean().default(true).notNull(),
	notes: text(),
	createdAt: timestamptz("created_at").default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamptz("updated_at").default(sql`timezone('utc'::text, now())`).notNull(),
	createdBy: uuid("created_by"),
	updatedBy: uuid("updated_by"),
	category: text(),
	roleId: uuid("role_id"),
}, (table) => [
	index("people_category_idx").using("btree", table.category.asc().nullsLast()),
	index("people_role_id_idx").using("btree", table.roleId.asc().nullsLast()),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [profiles.id],
			name: "people_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.roleId],
			foreignColumns: [roles.id],
			name: "people_role_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [profiles.id],
			name: "people_updated_by_fkey"
		}).onDelete("set null"),
]);

export const auditLog = pgTable("audit_log", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "audit_log_id_seq" }),
	tableName: text("table_name").notNull(),
	recordId: uuid("record_id").notNull(),
	matchId: uuid("match_id"),
	action: text().notNull(),
	changedBy: uuid("changed_by"),
	before: jsonb(),
	after: jsonb(),
	createdAt: timestamptz("created_at").default(sql`timezone('utc'::text, now())`).notNull(),
}, (table) => [
	index("audit_log_match_idx").using("btree", table.matchId.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
	index("idx_audit_log_match_id").using("btree", table.matchId.asc().nullsLast()).where(sql`(match_id IS NOT NULL)`),
	foreignKey({
			columns: [table.changedBy],
			foreignColumns: [profiles.id],
			name: "audit_log_changed_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.matchId],
			foreignColumns: [matches.id],
			name: "audit_log_match_id_fkey"
		}).onDelete("cascade"),
	check("audit_log_action_check", sql`action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])`),
]);

export const gridSyncRuns = pgTable("grid_sync_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	trigger: text().notNull(),
	status: text().notNull(),
	createdCount: integer("created_count").default(0).notNull(),
	updatedCount: integer("updated_count").default(0).notNull(),
	skippedCount: integer("skipped_count").default(0).notNull(),
	assignmentsUpserted: integer("assignments_upserted").default(0).notNull(),
	assignmentsDeleted: integer("assignments_deleted").default(0).notNull(),
	peopleCreated: integer("people_created").default(0).notNull(),
	error: text(),
	startedAt: timestamptz("started_at").default(sql`timezone('utc'::text, now())`).notNull(),
	finishedAt: timestamptz("finished_at"),
	deletedCount: integer("deleted_count").default(0).notNull(),
}, (table) => [
	index("grid_sync_runs_started_idx").using("btree", table.startedAt.desc().nullsFirst()),
]);

export const clubContacts = pgTable("club_contacts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	clubName: text("club_name").notNull(),
	league: text(),
	responsable: text(),
	phone: text(),
	sourceBlock: text("source_block"),
	notes: text(),
	createdAt: timestamptz("created_at").default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamptz("updated_at").default(sql`timezone('utc'::text, now())`).notNull(),
	createdBy: uuid("created_by"),
	updatedBy: uuid("updated_by"),
}, (table) => [
	index("club_contacts_name_idx").using("btree", table.clubName.asc().nullsLast()),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [profiles.id],
			name: "club_contacts_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [profiles.id],
			name: "club_contacts_updated_by_fkey"
		}).onDelete("set null"),
	unique("club_contacts_unique").on(table.clubName, table.responsable, table.phone),
]);

export const notificationLogs = pgTable("notification_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamptz("created_at").default(sql`now()`).notNull(),
	matchId: uuid("match_id"),
	personId: uuid("person_id"),
	matchLabel: text("match_label").default("").notNull(),
	recipientName: text("recipient_name").default("").notNull(),
	roleNames: text("role_names").array().default([]).notNull(),
	channel: text().notNull(),
	destination: text(),
	status: text().notNull(),
	error: text(),
	trigger: text().notNull(),
}, (table) => [
	index("notification_logs_created_at_idx").using("btree", table.createdAt.desc().nullsFirst()),
	index("notification_logs_status_idx").using("btree", table.status.asc().nullsLast()),
	foreignKey({
			columns: [table.matchId],
			foreignColumns: [matches.id],
			name: "notification_logs_match_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.personId],
			foreignColumns: [people.id],
			name: "notification_logs_person_id_fkey"
		}).onDelete("set null"),
	check("notification_logs_channel_check", sql`channel = ANY (ARRAY['whatsapp'::text, 'email'::text, 'none'::text])`),
	check("notification_logs_status_check", sql`status = ANY (ARRAY['sent'::text, 'failed'::text, 'skipped'::text, 'no_contact'::text])`),
	check("notification_logs_trigger_check", sql`trigger = ANY (ARRAY['cron'::text, 'catchup'::text, 'boot'::text, 'manual'::text])`),
]);

export const fixtures = pgTable("fixtures", {
	id: text().primaryKey().notNull(),
	competition: text(),
	category: text(),
	phase: text(),
	group: text(),
	homeClub: text("home_club"),
	homeTeam: text("home_team"),
	awayClub: text("away_club"),
	awayTeam: text("away_team"),
	suspended: boolean().default(false).notNull(),
	homePoints: integer("home_points"),
	awayPoints: integer("away_points"),
	matchDate: date("match_date"),
	matchTime: text("match_time"),
	venue: text(),
	court: text(),
	city: text(),
	province: text(),
	syncedAt: timestamptz("synced_at").default(sql`timezone('utc'::text, now())`).notNull(),
	createdAt: timestamptz("created_at").default(sql`timezone('utc'::text, now())`).notNull(),
}, (table) => [
	index("fixtures_category_idx").using("btree", table.category.asc().nullsLast()),
	index("fixtures_match_date_idx").using("btree", table.matchDate.asc().nullsLast()),
]);

export const assignments = pgTable("assignments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	matchId: uuid("match_id").notNull(),
	roleId: uuid("role_id").notNull(),
	personId: uuid("person_id"),
	confirmed: boolean().default(false).notNull(),
	notes: text(),
	createdAt: timestamptz("created_at").default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamptz("updated_at").default(sql`timezone('utc'::text, now())`).notNull(),
	createdBy: uuid("created_by"),
	updatedBy: uuid("updated_by"),
	attendanceConfirmedAt: timestamptz("attendance_confirmed_at"),
	attendanceResponse: text("attendance_response"),
	attendanceNote: text("attendance_note"),
}, (table) => [
	index("assignments_match_idx").using("btree", table.matchId.asc().nullsLast()),
	index("assignments_person_idx").using("btree", table.personId.asc().nullsLast()),
	index("idx_assignments_match_id").using("btree", table.matchId.asc().nullsLast()),
	index("idx_assignments_person_id").using("btree", table.personId.asc().nullsLast()).where(sql`(person_id IS NOT NULL)`),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [profiles.id],
			name: "assignments_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.matchId],
			foreignColumns: [matches.id],
			name: "assignments_match_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.personId],
			foreignColumns: [people.id],
			name: "assignments_person_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.roleId],
			foreignColumns: [roles.id],
			name: "assignments_role_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [profiles.id],
			name: "assignments_updated_by_fkey"
		}).onDelete("set null"),
	unique("assignments_match_role_unique").on(table.matchId, table.roleId),
	check("assignments_attendance_response_check", sql`attendance_response = ANY (ARRAY['attending'::text, 'declined'::text])`),
]);

export const matches = pgTable("matches", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	competition: text(),
	productionMode: text("production_mode"),
	status: matchStatus().default('Pendiente').notNull(),
	homeTeam: text("home_team").notNull(),
	awayTeam: text("away_team").notNull(),
	venue: text(),
	kickoffAt: timestamptz("kickoff_at").notNull(),
	durationMinutes: integer("duration_minutes").default(150).notNull(),
	timezone: text().default('America/Bogota').notNull(),
	ownerId: uuid("owner_id"),
	notes: text(),
	createdAt: timestamptz("created_at").default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamptz("updated_at").default(sql`timezone('utc'::text, now())`).notNull(),
	createdBy: uuid("created_by"),
	updatedBy: uuid("updated_by"),
	productionCode: text("production_code"),
	commentaryPlan: text("commentary_plan"),
	transport: text(),
	dayNotifiedAt: timestamptz("day_notified_at"),
	leagueId: uuid("league_id"),
}, (table) => [
	index("idx_matches_away_team_trgm").using("gin", table.awayTeam.asc().nullsLast().op("gin_trgm_ops")),
	index("idx_matches_competition").using("btree", table.competition.asc().nullsLast()).where(sql`(competition IS NOT NULL)`),
	index("idx_matches_competition_trgm").using("gin", table.competition.asc().nullsLast().op("gin_trgm_ops")),
	index("idx_matches_home_team_trgm").using("gin", table.homeTeam.asc().nullsLast().op("gin_trgm_ops")),
	index("idx_matches_kickoff_at").using("btree", table.kickoffAt.asc().nullsLast()),
	index("idx_matches_owner_id").using("btree", table.ownerId.asc().nullsLast()).where(sql`(owner_id IS NOT NULL)`),
	index("matches_kickoff_idx").using("btree", table.kickoffAt.asc().nullsLast()),
	index("matches_league_id_idx").using("btree", table.leagueId.asc().nullsLast()),
	index("matches_owner_idx").using("btree", table.ownerId.asc().nullsLast()),
	uniqueIndex("matches_production_code_key").using("btree", table.productionCode.asc().nullsLast()).where(sql`(production_code IS NOT NULL)`),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [profiles.id],
			name: "matches_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.leagueId],
			foreignColumns: [leagues.id],
			name: "matches_league_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.ownerId],
			foreignColumns: [people.id],
			name: "matches_owner_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [profiles.id],
			name: "matches_updated_by_fkey"
		}).onDelete("set null"),
	check("matches_duration_minutes_check", sql`duration_minutes > 0`),
]);

export const announcements = pgTable("announcements", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	body: text().notNull(),
	active: boolean().default(true).notNull(),
	createdAt: timestamptz("created_at").default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamptz("updated_at").default(sql`timezone('utc'::text, now())`).notNull(),
	createdBy: uuid("created_by"),
	updatedBy: uuid("updated_by"),
}, (table) => [
	index("announcements_active_updated_idx").using("btree", table.active.asc().nullsLast(), table.updatedAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [profiles.id],
			name: "announcements_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [profiles.id],
			name: "announcements_updated_by_fkey"
		}).onDelete("set null"),
]);

export const collaboratorReports = pgTable("collaborator_reports", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	assignmentId: uuid("assignment_id").notNull(),
	matchId: uuid("match_id").notNull(),
	reporterProfileId: uuid("reporter_profile_id"),
	incidentLevel: text("incident_level").notNull(),
	paid: boolean().default(false).notNull(),
	feedDetected: boolean("feed_detected").default(false).notNull(),
	signalLabel: text("signal_label").notNull(),
	aptoLineal: boolean("apto_lineal").default(false).notNull(),
	testTime: text("test_time"),
	testCheck: boolean("test_check").default(false).notNull(),
	startCheck: boolean("start_check").default(false).notNull(),
	graphicsCheck: boolean("graphics_check").default(false).notNull(),
	speedtestValue: text("speedtest_value"),
	pingValue: text("ping_value"),
	gpuValue: text("gpu_value"),
	technicalObservations: text("technical_observations"),
	buildingObservations: text("building_observations"),
	generalObservations: text("general_observations"),
	otherFlag: boolean("other_flag").default(false).notNull(),
	stFlag: boolean("st_flag").default(false).notNull(),
	clubFlag: boolean("club_flag").default(false).notNull(),
	otherObservation: text("other_observation"),
	stObservation: text("st_observation"),
	clubObservation: text("club_observation"),
	problems: jsonb().default({}).notNull(),
	attachments: jsonb().default({}).notNull(),
	submittedAt: timestamptz("submitted_at").default(sql`timezone('utc'::text, now())`).notNull(),
	createdAt: timestamptz("created_at").default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamptz("updated_at").default(sql`timezone('utc'::text, now())`).notNull(),
	createdBy: uuid("created_by"),
	updatedBy: uuid("updated_by"),
}, (table) => [
	index("collaborator_reports_match_idx").using("btree", table.matchId.asc().nullsLast(), table.submittedAt.desc().nullsFirst()),
	index("collaborator_reports_reporter_idx").using("btree", table.reporterProfileId.asc().nullsLast(), table.submittedAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.assignmentId],
			foreignColumns: [assignments.id],
			name: "collaborator_reports_assignment_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [profiles.id],
			name: "collaborator_reports_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.matchId],
			foreignColumns: [matches.id],
			name: "collaborator_reports_match_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.reporterProfileId],
			foreignColumns: [profiles.id],
			name: "collaborator_reports_reporter_profile_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [profiles.id],
			name: "collaborator_reports_updated_by_fkey"
		}).onDelete("set null"),
	unique("collaborator_reports_assignment_unique").on(table.assignmentId),
	check("collaborator_reports_incident_level_check", sql`incident_level = ANY (ARRAY['sin'::text, 'baja'::text, 'alta'::text, 'critica'::text])`),
]);

export const appSettings = pgTable("app_settings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	settingKey: text("setting_key").notNull(),
	secretValue: text("secret_value"),
	publicValue: text("public_value"),
	createdAt: timestamptz("created_at").default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamptz("updated_at").default(sql`timezone('utc'::text, now())`).notNull(),
	createdBy: uuid("created_by"),
	updatedBy: uuid("updated_by"),
}, (table) => [
	index("app_settings_key_idx").using("btree", table.settingKey.asc().nullsLast()),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [profiles.id],
			name: "app_settings_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [profiles.id],
			name: "app_settings_updated_by_fkey"
		}).onDelete("set null"),
	unique("app_settings_setting_key_key").on(table.settingKey),
]);

export const roles = pgTable("roles", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	category: text().default('Produccion').notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	active: boolean().default(true).notNull(),
	createdAt: timestamptz("created_at").default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamptz("updated_at").default(sql`timezone('utc'::text, now())`).notNull(),
	createdBy: uuid("created_by"),
	updatedBy: uuid("updated_by"),
}, (table) => [
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [profiles.id],
			name: "roles_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [profiles.id],
			name: "roles_updated_by_fkey"
		}).onDelete("set null"),
	unique("roles_name_key").on(table.name),
]);

export const personFunctions = pgTable("person_functions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	personId: uuid("person_id").notNull(),
	functionKey: text("function_key").notNull(),
	createdAt: timestamptz("created_at").default(sql`timezone('utc'::text, now())`).notNull(),
	createdBy: uuid("created_by"),
}, (table) => [
	index("person_functions_key_idx").using("btree", table.functionKey.asc().nullsLast()),
	index("person_functions_person_idx").using("btree", table.personId.asc().nullsLast()),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [profiles.id],
			name: "person_functions_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.personId],
			foreignColumns: [people.id],
			name: "person_functions_person_id_fkey"
		}).onDelete("cascade"),
	unique("person_functions_unique").on(table.personId, table.functionKey),
	check("person_functions_key_check", sql`function_key = ANY (ARRAY['Responsable'::text, 'Realizador'::text, 'Operador de Control'::text, 'Operador de Grafica'::text, 'Soporte tecnico'::text, 'Productor'::text, 'Relator'::text, 'Comentario'::text, 'Campo'::text, 'Encoder'::text, 'Ingenieria'::text, 'Camara'::text])`),
]);

export const leagues = pgTable("leagues", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	color: text(),
	sortOrder: integer("sort_order"),
	isExternal: boolean("is_external").default(false).notNull(),
	createdAt: timestamptz("created_at").default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamptz("updated_at").default(sql`timezone('utc'::text, now())`).notNull(),
}, (table) => [
	unique("leagues_slug_key").on(table.slug),
]);

export const teams = pgTable("teams", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	clubId: uuid("club_id").notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	category: text().default('mayores').notNull(),
	createdAt: timestamptz("created_at").default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamptz("updated_at").default(sql`timezone('utc'::text, now())`).notNull(),
}, (table) => [
	index("teams_club_id_idx").using("btree", table.clubId.asc().nullsLast()),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubs.id],
			name: "teams_club_id_fkey"
		}).onDelete("cascade"),
	unique("teams_club_category_unique").on(table.clubId, table.category),
	unique("teams_slug_key").on(table.slug),
	check("teams_category_check", sql`category = ANY (ARRAY['mayores'::text, 'proximo'::text, 'femenino'::text])`),
]);

export const clubAliases = pgTable("club_aliases", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	clubId: uuid("club_id").notNull(),
	alias: text().notNull(),
	createdAt: timestamptz("created_at").default(sql`timezone('utc'::text, now())`).notNull(),
}, (table) => [
	index("club_aliases_club_id_idx").using("btree", table.clubId.asc().nullsLast()),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubs.id],
			name: "club_aliases_club_id_fkey"
		}).onDelete("cascade"),
	unique("club_aliases_alias_key").on(table.alias),
]);

export const clubs = pgTable("clubs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	stadium: text(),
	website: text(),
	instagram: text(),
	logoUrl: text("logo_url"),
	createdAt: timestamptz("created_at").default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamptz("updated_at").default(sql`timezone('utc'::text, now())`).notNull(),
	manager: text(),
	officialUrl: text("official_url"),
}, (table) => [
	unique("clubs_name_key").on(table.name),
	unique("clubs_slug_key").on(table.slug),
]);

export const teamLeagueMemberships = pgTable("team_league_memberships", {
	teamId: uuid("team_id").notNull(),
	leagueId: uuid("league_id").notNull(),
	season: text().notNull(),
	createdAt: timestamptz("created_at").default(sql`timezone('utc'::text, now())`).notNull(),
}, (table) => [
	index("team_league_memberships_league_season_idx").using("btree", table.leagueId.asc().nullsLast(), table.season.asc().nullsLast()),
	foreignKey({
			columns: [table.leagueId],
			foreignColumns: [leagues.id],
			name: "team_league_memberships_league_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "team_league_memberships_team_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.teamId, table.leagueId, table.season], name: "team_league_memberships_pkey"}),
]);
