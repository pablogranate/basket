// src/lib/auth/schema.ts
// Source: better-auth.com/docs/adapters/drizzle + concepts/database + plugins/admin
import {
  boolean,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
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

// Acceso: one identity's Nivel in one sibling app (ADR 0009). The portal is
// exempt (its entry is a Cuenta's role), so there is no `portal` value. Adding
// a sibling is a deliberate migration extending the enum.
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

export const authAppAccess = pgTable(
  "auth_app_access",
  {
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    app: appAccessApp("app").notNull(),
    level: appAccessLevel("level").notNull(),
    // Auth user id of the admin who granted; null for seeded rows.
    grantedBy: text("granted_by").references(() => authUser.id, {
      onDelete: "set null",
    }),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.app] })],
);
