// src/lib/auth/schema.ts
// Source: better-auth.com/docs/adapters/drizzle + concepts/database + plugins/admin
import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const authUser = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  // admin plugin (baked in now — D-07)
  role: text("role"),
  banned: boolean("banned"),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
});

export const authSession = pgTable("auth_session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => authUser.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  // admin plugin (D-07)
  impersonatedBy: text("impersonated_by"),
});

export const authAccount = pgTable("auth_account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => authUser.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const authVerification = pgTable("auth_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

// Nivel enums from ADR 0009. Kept while readers still read `level`; dropped
// by the contract step of ADR 0010 along with the column.
export const appAccessApp = pgEnum("auth_app_access_app", [
  "analytics",
  "incidencias",
  "generator",
  "ops",
  "facturacion",
]);

export const appAccessLevel = pgEnum("auth_app_access_level", [
  "read",
  "write",
  "admin",
]);

// Catálogo de roles (ADR 0010): the apps, and the roles each one declares.
// Adding an app or a role is a row, not a migration of an enum.
export const authApp = pgTable("auth_app", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const authAppRole = pgTable(
  "auth_app_role",
  {
    app: text("app")
      .notNull()
      .references(() => authApp.key, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    // Higher outranks lower within one app; grant rules compare ranks.
    rank: integer("rank").notNull(),
    isAdmin: boolean("is_admin").notNull().default(false),
    // The Nivel this role equals while readers still read `level`; null for
    // apps that never had one (portal). Dropped with `level`.
    legacyLevel: appAccessLevel("legacy_level"),
  },
  (table) => [
    primaryKey({ columns: [table.app, table.key] }),
    // A super admin resolves to exactly one role per app.
    uniqueIndex("auth_app_role_one_admin_per_app")
      .on(table.app)
      .where(sql`${table.isAdmin}`),
  ],
);

// Acceso: one identity's role in one app (ADR 0010). `level` is the ADR 0009
// Nivel, written alongside `role` until every reader moves to the view.
export const authAppAccess = pgTable(
  "auth_app_access",
  {
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    app: text("app")
      .notNull()
      .references(() => authApp.key),
    role: text("role").notNull(),
    level: appAccessLevel("level"),
    // Auth user id of the admin who granted; null for seeded rows.
    grantedBy: text("granted_by").references(() => authUser.id, {
      onDelete: "set null",
    }),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.app] }),
    foreignKey({
      columns: [table.app, table.role],
      foreignColumns: [authAppRole.app, authAppRole.key],
      name: "auth_app_access_app_role_fk",
    }),
  ],
);

// What every gate reads: one row per identity and app. A non-banned super
// admin (auth_user.role = 'superadmin') resolves every app to its admin role;
// their explicit rows are kept so a demotion restores them. Defined in
// drizzle/auth/0003_role_catalog.sql.
export const authEffectiveAccess = pgView("auth_effective_access", {
  userId: text("user_id").notNull(),
  app: text("app").notNull(),
  role: text("role").notNull(),
  rank: integer("rank").notNull(),
  isAdmin: boolean("is_admin").notNull(),
  viaSuperadmin: boolean("via_superadmin").notNull(),
}).existing();
