// src/lib/auth/schema.ts
// Source: better-auth.com/docs/adapters/drizzle + concepts/database + plugins/admin
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
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
  },
  (table) => [
    primaryKey({ columns: [table.app, table.key] }),
    // A super admin resolves to exactly one role per app.
    uniqueIndex("auth_app_role_one_admin_per_app")
      .on(table.app)
      .where(sql`${table.isAdmin}`),
  ],
);

// Acceso: one identity's role in one app (ADR 0010).
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

// Identity-level changes made from the apex users section (super admin set or
// removed, bans, sign-outs, creations). Role grants are audited by the
// granted_by/granted_at columns of auth_app_access instead.
export const authAuditLog = pgTable(
  "auth_audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    // Null when a script acted (bootstrap).
    actorId: text("actor_id").references(() => authUser.id, {
      onDelete: "set null",
    }),
    targetUserId: text("target_user_id").references(() => authUser.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("auth_audit_log_target_idx").on(table.targetUserId, table.createdAt),
  ],
);

// Solicitud de acceso (ADR 0011): one identity asking for one app. The status
// vocabulary and every rule around it live in src/lib/access-requests/
// requests.ts; the partial unique indexes below are what enforce "one pending
// per identity (and per email) per app".
export const authAccessRequest = pgTable(
  "auth_access_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    app: text("app")
      .notNull()
      .references(() => authApp.key),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    // Asked only for the portal.
    funcion: text("funcion"),
    ciudad: text("ciudad"),
    mensaje: text("mensaje"),
    status: text("status").notNull().default("pendiente"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    // An identity, not a Cuenta, so super admins without one are auditable.
    decidedBy: text("decided_by").references(() => authUser.id, {
      onDelete: "set null",
    }),
    grantedRole: text("granted_role"),
    // Portal ficha (Domain DB people.id); cross-database, so no FK.
    personId: uuid("person_id"),
  },
  (table) => [
    uniqueIndex("auth_access_request_pending_user_app_key")
      .on(table.userId, table.app)
      .where(sql`status = 'pendiente'`),
    uniqueIndex("auth_access_request_pending_email_app_key")
      .on(sql`lower(${table.email})`, table.app)
      .where(sql`status = 'pendiente'`),
    index("auth_access_request_user_idx").on(table.userId, table.createdAt),
    index("auth_access_request_app_status_idx").on(
      table.app,
      table.status,
      table.createdAt,
    ),
    check(
      "auth_access_request_status_check",
      sql`status IN ('pendiente', 'aprobada', 'rechazada')`,
    ),
  ],
);

// Who gets the "new Solicitud" email for one app. The portal routes by
// Función through app_settings instead; this table serves every other app.
export const authAppRequestRecipients = pgTable(
  "auth_app_request_recipients",
  {
    app: text("app")
      .notNull()
      .references(() => authApp.key, { onDelete: "cascade" }),
    email: text("email").notNull(),
  },
  (table) => [primaryKey({ columns: [table.app, table.email] })],
);
