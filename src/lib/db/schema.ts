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
  bigint,
  primaryKey,
} from "drizzle-orm/pg-core";

// ===== NEXTAUTH USERS (canonical schema per @auth/drizzle-adapter) =====
export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    email: text("email").unique(),
    emailVerified: timestamp("emailVerified"),
    image: text("image"),
    password: text("password"),
  },
  (table) => ({
    emailIdx: index("user_email_idx").on(table.email),
  }),
);

// ===== NEXTAUTH ACCOUNTS =====
export const account = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: bigint("expires_at", { mode: "number" }),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
    userIdIdx: index("account_userId_idx").on(account.userId),
  }),
);

// ===== NEXTAUTH SESSIONS =====
export const session = pgTable(
  "session",
  {
    sessionToken: text("sessionToken").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expires: timestamp("expires").notNull(),
  },
  (session) => ({
    userIdIdx: index("session_userId_idx").on(session.userId),
  }),
);

// ===== NEXTAUTH VERIFICATION TOKENS =====
export const verificationToken = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires").notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({
      columns: [vt.identifier, vt.token],
    }),
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
    isHero: boolean("is_hero").default(false),
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
    status: text("status").default("active").notNull(),
    goal: text("goal"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => ({
    collectionIdx: index("sessions_collection_id_idx").on(table.collectionId),
    curatorIdx: index("sessions_curator_id_idx").on(table.curatorId),
    activeIdx: uniqueIndex("sessions_active_unique").on(
      table.collectionId,
      table.curatorId,
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
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionIdx: index("decision_events_session_id_idx").on(table.sessionId),
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
    comparisonCount: integer("comparison_count").notNull(),
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
    status: text("status").default("draft").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    finalizedAt: timestamp("finalized_at"),
  },
  (table) => ({
    collectionIdx: index("sort_results_collection_id_idx").on(table.collectionId),
    curatorIdx: index("sort_results_curator_id_idx").on(table.curatorId),
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
    tokenIdx: uniqueIndex("sort_shares_token_unique").on(table.shareToken),
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
    canManageCollection: boolean("can_manage_collection").default(false),
    canInviteMembers: boolean("can_invite_members").default(false),
    canAddItems: boolean("can_add_items").default(true),
    canEditMetadata: boolean("can_edit_metadata").default(true),
    canAddPhotos: boolean("can_add_photos").default(true),
    canDeletePhotos: boolean("can_delete_photos").default(false),
    canSort: boolean("can_sort").default(true),
    canViewOutputs: boolean("can_view_outputs").default(true),
    status: text("status").default("pending").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    acceptedAt: timestamp("accepted_at"),
  },
  (table) => ({
    collectionIdx: index("invitations_collection_id_idx").on(table.collectionId),
    tokenIdx: uniqueIndex("invitations_token_unique").on(table.token),
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
    canManageCollection: boolean("can_manage_collection").default(false),
    canInviteMembers: boolean("can_invite_members").default(false),
    canAddItems: boolean("can_add_items").default(true),
    canDeleteItems: boolean("can_delete_items").default(false),
    canEditMetadata: boolean("can_edit_metadata").default(true),
    canAddPhotos: boolean("can_add_photos").default(true),
    canDeletePhotos: boolean("can_delete_photos").default(false),
    canSort: boolean("can_sort").default(true),
    canViewOutputs: boolean("can_view_outputs").default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    collectionUserIdx: uniqueIndex("memberships_collection_user_unique").on(
      table.collectionId,
      table.userId,
    ),
  }),
);
