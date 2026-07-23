import { relations } from "drizzle-orm/relations";
import { profiles, people, roles, auditLog, matches, clubContacts, notificationLogs, assignments, leagues, announcements, collaboratorReports, appSettings, personFunctions, peopleTeams, clubs, teams, clubAliases, teamLeagueMemberships } from "./schema";

export const peopleRelations = relations(people, ({one, many}) => ({
	profile_createdBy: one(profiles, {
		fields: [people.createdBy],
		references: [profiles.id],
		relationName: "people_createdBy_profiles_id"
	}),
	role: one(roles, {
		fields: [people.roleId],
		references: [roles.id]
	}),
	profile_updatedBy: one(profiles, {
		fields: [people.updatedBy],
		references: [profiles.id],
		relationName: "people_updatedBy_profiles_id"
	}),
	notificationLogs: many(notificationLogs),
	assignments: many(assignments),
	matches: many(matches),
	personFunctions: many(personFunctions),
	peopleTeams: many(peopleTeams),
}));

export const profilesRelations = relations(profiles, ({many}) => ({
	people_createdBy: many(people, {
		relationName: "people_createdBy_profiles_id"
	}),
	people_updatedBy: many(people, {
		relationName: "people_updatedBy_profiles_id"
	}),
	auditLogs: many(auditLog),
	clubContacts_createdBy: many(clubContacts, {
		relationName: "clubContacts_createdBy_profiles_id"
	}),
	clubContacts_updatedBy: many(clubContacts, {
		relationName: "clubContacts_updatedBy_profiles_id"
	}),
	assignments_createdBy: many(assignments, {
		relationName: "assignments_createdBy_profiles_id"
	}),
	assignments_updatedBy: many(assignments, {
		relationName: "assignments_updatedBy_profiles_id"
	}),
	matches_createdBy: many(matches, {
		relationName: "matches_createdBy_profiles_id"
	}),
	matches_updatedBy: many(matches, {
		relationName: "matches_updatedBy_profiles_id"
	}),
	announcements_createdBy: many(announcements, {
		relationName: "announcements_createdBy_profiles_id"
	}),
	announcements_updatedBy: many(announcements, {
		relationName: "announcements_updatedBy_profiles_id"
	}),
	collaboratorReports_createdBy: many(collaboratorReports, {
		relationName: "collaboratorReports_createdBy_profiles_id"
	}),
	collaboratorReports_reporterProfileId: many(collaboratorReports, {
		relationName: "collaboratorReports_reporterProfileId_profiles_id"
	}),
	collaboratorReports_updatedBy: many(collaboratorReports, {
		relationName: "collaboratorReports_updatedBy_profiles_id"
	}),
	appSettings_createdBy: many(appSettings, {
		relationName: "appSettings_createdBy_profiles_id"
	}),
	appSettings_updatedBy: many(appSettings, {
		relationName: "appSettings_updatedBy_profiles_id"
	}),
	roles_createdBy: many(roles, {
		relationName: "roles_createdBy_profiles_id"
	}),
	roles_updatedBy: many(roles, {
		relationName: "roles_updatedBy_profiles_id"
	}),
	personFunctions: many(personFunctions),
}));

export const rolesRelations = relations(roles, ({one, many}) => ({
	people: many(people),
	assignments: many(assignments),
	profile_createdBy: one(profiles, {
		fields: [roles.createdBy],
		references: [profiles.id],
		relationName: "roles_createdBy_profiles_id"
	}),
	profile_updatedBy: one(profiles, {
		fields: [roles.updatedBy],
		references: [profiles.id],
		relationName: "roles_updatedBy_profiles_id"
	}),
}));

export const auditLogRelations = relations(auditLog, ({one}) => ({
	profile: one(profiles, {
		fields: [auditLog.changedBy],
		references: [profiles.id]
	}),
	match: one(matches, {
		fields: [auditLog.matchId],
		references: [matches.id]
	}),
}));

export const matchesRelations = relations(matches, ({one, many}) => ({
	auditLogs: many(auditLog),
	notificationLogs: many(notificationLogs),
	assignments: many(assignments),
	profile_createdBy: one(profiles, {
		fields: [matches.createdBy],
		references: [profiles.id],
		relationName: "matches_createdBy_profiles_id"
	}),
	league: one(leagues, {
		fields: [matches.leagueId],
		references: [leagues.id]
	}),
	person: one(people, {
		fields: [matches.ownerId],
		references: [people.id]
	}),
	profile_updatedBy: one(profiles, {
		fields: [matches.updatedBy],
		references: [profiles.id],
		relationName: "matches_updatedBy_profiles_id"
	}),
	collaboratorReports: many(collaboratorReports),
}));

export const clubContactsRelations = relations(clubContacts, ({one}) => ({
	profile_createdBy: one(profiles, {
		fields: [clubContacts.createdBy],
		references: [profiles.id],
		relationName: "clubContacts_createdBy_profiles_id"
	}),
	profile_updatedBy: one(profiles, {
		fields: [clubContacts.updatedBy],
		references: [profiles.id],
		relationName: "clubContacts_updatedBy_profiles_id"
	}),
}));

export const notificationLogsRelations = relations(notificationLogs, ({one}) => ({
	match: one(matches, {
		fields: [notificationLogs.matchId],
		references: [matches.id]
	}),
	person: one(people, {
		fields: [notificationLogs.personId],
		references: [people.id]
	}),
}));

export const assignmentsRelations = relations(assignments, ({one, many}) => ({
	profile_createdBy: one(profiles, {
		fields: [assignments.createdBy],
		references: [profiles.id],
		relationName: "assignments_createdBy_profiles_id"
	}),
	match: one(matches, {
		fields: [assignments.matchId],
		references: [matches.id]
	}),
	person: one(people, {
		fields: [assignments.personId],
		references: [people.id]
	}),
	role: one(roles, {
		fields: [assignments.roleId],
		references: [roles.id]
	}),
	profile_updatedBy: one(profiles, {
		fields: [assignments.updatedBy],
		references: [profiles.id],
		relationName: "assignments_updatedBy_profiles_id"
	}),
	collaboratorReports: many(collaboratorReports),
}));

export const leaguesRelations = relations(leagues, ({many}) => ({
	matches: many(matches),
	teamLeagueMemberships: many(teamLeagueMemberships),
}));

export const announcementsRelations = relations(announcements, ({one}) => ({
	profile_createdBy: one(profiles, {
		fields: [announcements.createdBy],
		references: [profiles.id],
		relationName: "announcements_createdBy_profiles_id"
	}),
	profile_updatedBy: one(profiles, {
		fields: [announcements.updatedBy],
		references: [profiles.id],
		relationName: "announcements_updatedBy_profiles_id"
	}),
}));

export const collaboratorReportsRelations = relations(collaboratorReports, ({one}) => ({
	assignment: one(assignments, {
		fields: [collaboratorReports.assignmentId],
		references: [assignments.id]
	}),
	profile_createdBy: one(profiles, {
		fields: [collaboratorReports.createdBy],
		references: [profiles.id],
		relationName: "collaboratorReports_createdBy_profiles_id"
	}),
	match: one(matches, {
		fields: [collaboratorReports.matchId],
		references: [matches.id]
	}),
	profile_reporterProfileId: one(profiles, {
		fields: [collaboratorReports.reporterProfileId],
		references: [profiles.id],
		relationName: "collaboratorReports_reporterProfileId_profiles_id"
	}),
	profile_updatedBy: one(profiles, {
		fields: [collaboratorReports.updatedBy],
		references: [profiles.id],
		relationName: "collaboratorReports_updatedBy_profiles_id"
	}),
}));

export const appSettingsRelations = relations(appSettings, ({one}) => ({
	profile_createdBy: one(profiles, {
		fields: [appSettings.createdBy],
		references: [profiles.id],
		relationName: "appSettings_createdBy_profiles_id"
	}),
	profile_updatedBy: one(profiles, {
		fields: [appSettings.updatedBy],
		references: [profiles.id],
		relationName: "appSettings_updatedBy_profiles_id"
	}),
}));

export const personFunctionsRelations = relations(personFunctions, ({one}) => ({
	profile: one(profiles, {
		fields: [personFunctions.createdBy],
		references: [profiles.id]
	}),
	person: one(people, {
		fields: [personFunctions.personId],
		references: [people.id]
	}),
}));

export const teamsRelations = relations(teams, ({one, many}) => ({
	club: one(clubs, {
		fields: [teams.clubId],
		references: [clubs.id]
	}),
	teamLeagueMemberships: many(teamLeagueMemberships),
	peopleTeams: many(peopleTeams),
}));

export const peopleTeamsRelations = relations(peopleTeams, ({one}) => ({
	person: one(people, {
		fields: [peopleTeams.personId],
		references: [people.id]
	}),
	team: one(teams, {
		fields: [peopleTeams.teamId],
		references: [teams.id]
	}),
	profile: one(profiles, {
		fields: [peopleTeams.createdBy],
		references: [profiles.id]
	}),
}));

export const clubsRelations = relations(clubs, ({many}) => ({
	teams: many(teams),
	clubAliases: many(clubAliases),
}));

export const clubAliasesRelations = relations(clubAliases, ({one}) => ({
	club: one(clubs, {
		fields: [clubAliases.clubId],
		references: [clubs.id]
	}),
}));

export const teamLeagueMembershipsRelations = relations(teamLeagueMemberships, ({one}) => ({
	league: one(leagues, {
		fields: [teamLeagueMemberships.leagueId],
		references: [leagues.id]
	}),
	team: one(teams, {
		fields: [teamLeagueMemberships.teamId],
		references: [teams.id]
	}),
}));