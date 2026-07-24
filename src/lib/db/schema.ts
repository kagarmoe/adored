import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ===== BETTER-AUTH CORE TABLES (canonical — better-auth owns them) =====
//
// better-auth's four core models under their DEFAULT table names (Cutover Pass
// 2b-ii collapsed the old two-table `user`↔`ba_user` split into this single
// canonical set — NextAuth is gone, so there is no name collision). better-auth
// matches its model FIELDS by the Drizzle *property key* (camelCase:
// `emailVerified`, `accountId`, …), NOT the SQL column-name string — so the
// property keys are canonical and must not be renamed. Shape verified against
// `npx @better-auth/cli generate` for better-auth 1.6.x.
//
// `user` is the ONE canonical user table: every domain FK below resolves to it.
// The credential password lives in `account.password` (NOT on `user`).
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
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
  },
  (account) => ({
    userIdIdx: index("account_userId_idx").on(account.userId),
  }),
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (session) => ({
    userIdIdx: index("session_userId_idx").on(session.userId),
  }),
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (verification) => ({
    identifierIdx: index("verification_identifier_idx").on(verification.identifier),
  }),
);

// ===== COLLECTIONS =====
export const collectionsTable = pgTable(
  "collections",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    name: text("name").notNull(),
    slug: text("slug"),
    description: text("description"),
    status: text("status").default("active").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => ({
    ownerIdx: index("collections_owner_id_idx").on(table.ownerId),
    slugUnique: uniqueIndex("collections_slug_unique").on(table.slug),
  }),
);

// ===== ITEMS =====
export const itemsTable = pgTable(
  "items",
  {
    id: text("id").primaryKey(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collectionsTable.id),
    name: text("name"),
    brand: text("brand"),
    style: text("style"),
    color: text("color"),
    material: text("material"),
    category: text("category"),
    number: integer("number"),
    height: numeric("height"),
    width: numeric("width"),
    depth: numeric("depth"),
    weight: numeric("weight"),
    unit: text("unit").default("imperial").notNull(),
    status: text("status"),
    notes: text("notes"),
    story: text("story"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => ({
    collectionIdx: index("items_collection_id_idx").on(table.collectionId),
    collectionNumberUnique: uniqueIndex("items_collection_number_unique").on(
      table.collectionId,
      table.number,
    ),
  }),
);

// ===== PHOTOS =====
export const photosTable = pgTable(
  "photos",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id").references(() => itemsTable.id),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collectionsTable.id),
    blobKey: text("blob_key").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: integer("file_size"),
    uploadedBy: text("uploaded_by").notNull(),
    isHero: boolean("is_hero").notNull().default(false),
    rotation: integer("rotation").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    itemIdIdx: index("photos_item_id_idx").on(table.itemId),
    collectionIdx: index("photos_collection_id_idx").on(table.collectionId),
    uploadedByIdx: index("photos_uploaded_by_idx").on(table.uploadedBy),
    deletedAtIdx: index("photos_deleted_at_idx").on(table.deletedAt),
  }),
);

// ===== SESSIONS =====
export const sessionsTable = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collectionsTable.id),
    curatorId: text("curator_id")
      .notNull()
      .references(() => user.id),
    number: integer("number").notNull(),
    status: text("status").default("active").notNull(),
    goal: text("goal"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => ({
    collectionIdx: index("sessions_collection_id_idx").on(table.collectionId),
    curatorIdx: index("sessions_curator_id_idx").on(table.curatorId),
    activeIdx: uniqueIndex("sessions_active_unique")
      .on(table.collectionId, table.curatorId)
      .where(
        sql`${table.deletedAt} is null and ${table.status} in ('active','paused')`,
      ),
    collectionNumberUnique: uniqueIndex("sessions_collection_number_unique").on(
      table.collectionId,
      table.number,
    ),
  }),
);

// ===== DECISION EVENTS =====
export const decisionEventsTable = pgTable(
  "decision_events",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessionsTable.id),
    type: text("type").notNull(),
    decision: jsonb("decision").notNull(),
    clientKey: text("client_key"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionIdx: index("decision_events_session_id_idx").on(table.sessionId),
    clientKeyUnique: uniqueIndex("decision_events_client_key_unique")
      .on(table.sessionId, table.clientKey)
      .where(sql`${table.clientKey} is not null`),
  }),
);

// ===== AUDIT LOG (append-only; permanent-purge trail) =====
// No foreign keys: the targets (item, collection) are being deleted, so rows
// reference them by id as a standalone historical record. Append-only — no
// UPDATE/DELETE path. Index orders the only read query and is a TOTAL order
// (id tie-breaks same-millisecond createdAt) so a future keyset cursor is safe.
export const auditLogTable = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    collectionId: text("collection_id").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    collectionCreatedIdx: index("audit_log_collection_created_idx").on(
      table.collectionId,
      table.createdAt,
      table.id,
    ),
  }),
);

// ===== COLLECTION PREFERENCE ITEMS =====
export const preferencesTable = pgTable(
  "preferences",
  {
    id: text("id").primaryKey(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collectionsTable.id),
    curatorId: text("curator_id")
      .notNull()
      .references(() => user.id),
    itemId: text("item_id")
      .notNull()
      .references(() => itemsTable.id),
    score: numeric("score", { precision: 10, scale: 4 }).notNull(),
    confidence: numeric("confidence", { precision: 10, scale: 4 }).notNull(),
    rankBucket: text("rank_bucket").notNull(),
    // Per-curator manual bin overlay (purses-xxo7): a hand-set 1-of-4 bin that wins
    // over the computed rankBucket for display (effectiveBucket = manualBucket ??
    // rankBucket). Nullable, plain text, no CHECK — mirrors the sort_result_items
    // manualBucket precedent; the route's zod enum guards writes. NOT in bulkUpsert's
    // conflict-SET list, so a recompute leaves a live overlay untouched.
    manualBucket: text("manual_bucket"),
    comparisonCount: integer("comparison_count").notNull(),
    orderRank: integer("order_rank"),
    lastSeen: timestamp("last_seen").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    collectionCuratorIdx: index("preferences_collection_curator_idx").on(
      table.collectionId,
      table.curatorId,
    ),
    itemCuratorIdx: uniqueIndex("preferences_item_curator_unique").on(
      table.itemId,
      table.curatorId,
    ),
    orderRankUnique: uniqueIndex("preferences_order_rank_unique")
      .on(table.collectionId, table.curatorId, table.orderRank)
      .where(sql`${table.orderRank} is not null`),
  }),
);

// ===== ITEM DISPOSITIONS (curator-scoped: 'set_aside' = Not Mine, 'deferred' = Not Yet) =====
export const itemDispositionsTable = pgTable(
  "item_dispositions",
  {
    id: text("id").primaryKey(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collectionsTable.id),
    curatorId: text("curator_id")
      .notNull()
      .references(() => user.id),
    itemId: text("item_id")
      .notNull()
      .references(() => itemsTable.id),
    disposition: text("disposition").notNull(), // 'set_aside' | 'deferred'
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    itemCuratorUnique: uniqueIndex("item_dispositions_item_curator_unique").on(
      table.itemId,
      table.curatorId,
    ),
    collectionCuratorIdx: index("item_dispositions_collection_curator_idx").on(
      table.collectionId,
      table.curatorId,
    ),
  }),
);

// ===== SORT RESULTS =====
export const sortResultsTable = pgTable(
  "sort_results",
  {
    id: text("id").primaryKey(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collectionsTable.id),
    curatorId: text("curator_id")
      .notNull()
      .references(() => user.id),
    number: integer("number").notNull(),
    status: text("status").default("draft").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    finalizedAt: timestamp("finalized_at"),
  },
  (table) => ({
    collectionIdx: index("sort_results_collection_id_idx").on(table.collectionId),
    curatorIdx: index("sort_results_curator_id_idx").on(table.curatorId),
    collectionNumberUnique: uniqueIndex("sort_results_collection_number_unique").on(
      table.collectionId,
      table.number,
    ),
  }),
);

// ===== SORT RESULT ITEMS =====
export const sortResultItemsTable = pgTable(
  "sort_result_items",
  {
    id: text("id").primaryKey(),
    sortResultId: text("sort_result_id")
      .notNull()
      .references(() => sortResultsTable.id),
    itemId: text("item_id")
      .notNull()
      .references(() => itemsTable.id),
    computedRank: integer("computed_rank").notNull(),
    computedBucket: text("computed_bucket").notNull(),
    manualRank: integer("manual_rank"),
    manualBucket: text("manual_bucket"),
    // Epic S: usage standing snapshotted AT materialization ('uses'|'not_uses'|
    // NULL). Nullable text, no CHECK — matches the manualBucket plain-text
    // precedent; deriveUsage's typed output guards writes. A pre-Epic-S row (all
    // NULL) means "unknown at snapshot time" and renders no chip.
    usage: text("usage"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    resultIdx: index("sort_result_items_result_id_idx").on(table.sortResultId),
  }),
);

// ===== SORT RESULT SHARES =====
export const sortResultSharesTable = pgTable(
  "sort_result_shares",
  {
    id: text("id").primaryKey(),
    sortResultId: text("sort_result_id")
      .notNull()
      .references(() => sortResultsTable.id),
    shareToken: text("share_token").notNull().unique(),
    status: text("status").default("active").notNull(),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    // NO uniqueIndex on shareToken: the column's .unique() above already emits a
    // constraint (sort_result_shares_share_token_unique) and Postgres backs it with
    // an index. An explicit second unique index here differs only in NAME, so both
    // survived — two btrees maintained on every share insert, for one guarantee.
    // Dropped while the DB is being rebuilt from scratch, which is the only moment
    // it is free. (The invitations twin had the SAME name and so was a fatal 42P07.)
    resultIdx: index("sort_shares_result_id_idx").on(table.sortResultId),
  }),
);

// ===== INVITATIONS =====
export const invitationsTable = pgTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collectionsTable.id),
    email: text("email").notNull(),
    token: text("token").notNull().unique(),
    status: text("status").default("pending").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    acceptedAt: timestamp("accepted_at"),
  },
  (table) => ({
    collectionIdx: index("invitations_collection_id_idx").on(table.collectionId),
    // NO uniqueIndex on `token` here: the column's .unique() above already emits a
    // constraint named `invitations_token_unique`, and an explicit index of that
    // name collides with it. drizzle-kit 0.20 emitted CREATE UNIQUE INDEX IF NOT
    // EXISTS, so the duplicate silently no-op'd; 0.31 drops the IF NOT EXISTS and
    // it is a fatal 42P07. The constraint is what actually exists in the DB.
    emailIdx: index("invitations_email_idx").on(table.email),
  }),
);

// ===== COLLECTION MEMBERSHIPS =====
export const membershipsTable = pgTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collectionsTable.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    role: text("role").default("curator").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    collectionUserIdx: uniqueIndex("memberships_collection_user_unique").on(
      table.collectionId,
      table.userId,
    ),
    // Ported from migration 0006, which added this by hand: drizzle-orm 0.30 had
    // no check() API, so the constraint lived ONLY in migration SQL and was
    // invisible to `drizzle-kit generate`. Declaring it here is what stops the
    // squashed baseline from silently shipping `role` as free text.
    roleCheck: check("memberships_role_check", sql`${table.role} in ('owner', 'curator')`),
  }),
);
