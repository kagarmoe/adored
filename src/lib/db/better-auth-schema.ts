import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";

// ===== BETTER-AUTH TABLES (Phase 0 — runs ALONGSIDE NextAuth) =====
//
// These are better-auth's four core models (user/account/session/verification).
// better-auth matches its model FIELDS by the Drizzle *property key* (camelCase:
// `emailVerified`, `accountId`, …), NOT the SQL column-name string — so the
// property keys below are canonical and must not be renamed. The SQL column
// names and, crucially, the TABLE names are prefixed `ba_` so they do NOT
// collide with the live NextAuth tables (`user`/`account`/`session`/
// `verificationToken`), whose column shapes differ. Phase 1 (RESET) drops the
// NextAuth tables and takes over the canonical names; until then both coexist.
//
// Column set + nullability match better-auth 1.6.x's documented core schema.

export const baUser = pgTable("ba_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const baSession = pgTable("ba_session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => baUser.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const baAccount = pgTable("ba_account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => baUser.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const baVerification = pgTable("ba_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
