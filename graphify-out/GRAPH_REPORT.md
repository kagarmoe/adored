# Graph Report - .  (2026-06-18)

## Corpus Check
- 336 files · ~382,856 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1420 nodes · 3573 edges · 97 communities (74 shown, 23 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 111 edges (avg confidence: 0.81)
- Token cost: 132,320 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Domain types & barrels|Domain types & barrels]]
- [[_COMMUNITY_Sort results & ranking|Sort results & ranking]]
- [[_COMMUNITY_DB access layer|DB access layer]]
- [[_COMMUNITY_Authorization guards|Authorization guards]]
- [[_COMMUNITY_Architecture & project docs|Architecture & project docs]]
- [[_COMMUNITY_Collections domain|Collections domain]]
- [[_COMMUNITY_Database  Drizzle schema|Database / Drizzle schema]]
- [[_COMMUNITY_Sort sessions|Sort sessions]]
- [[_COMMUNITY_App Router pages|App Router pages]]
- [[_COMMUNITY_Auth & sessions|Auth & sessions]]
- [[_COMMUNITY_DB connection|DB connection]]
- [[_COMMUNITY_ID generation|ID generation]]
- [[_COMMUNITY_PoolUpload.tsx|PoolUpload.tsx]]
- [[_COMMUNITY_seed.ts|seed.ts]]
- [[_COMMUNITY_getTestDb()|getTestDb()]]
- [[_COMMUNITY_static-coverage.mjs|static-coverage.mjs]]
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_User|User]]
- [[_COMMUNITY_devDependencies|devDependencies]]
- [[_COMMUNITY_CollectionForm.tsx|CollectionForm.tsx]]
- [[_COMMUNITY_CollectionMembership|CollectionMembership]]
- [[_COMMUNITY_dependencies|dependencies]]
- [[_COMMUNITY_Item|Item]]
- [[_COMMUNITY_index.ts|index.ts]]
- [[_COMMUNITY_members.ts|members.ts]]
- [[_COMMUNITY_scripts|scripts]]
- [[_COMMUNITY_domain.ts|domain.ts]]
- [[_COMMUNITY_Invitation|Invitation]]
- [[_COMMUNITY_invitations.ts|invitations.ts]]
- [[_COMMUNITY_route.ts|route.ts]]
- [[_COMMUNITY_Project Instructions for AI|Project Instructions for AI]]
- [[_COMMUNITY_Button|Button]]
- [[_COMMUNITY_route.ts|route.ts]]
- [[_COMMUNITY_DecisionEvent|DecisionEvent]]
- [[_COMMUNITY_Input|Input]]
- [[_COMMUNITY_CollectionPreferenceItem|CollectionPreferenceItem]]
- [[_COMMUNITY_AppLayout.tsx|AppLayout.tsx]]
- [[_COMMUNITY_append-history.mjs|append-history.mjs]]
- [[_COMMUNITY_page.tsx|page.tsx]]
- [[_COMMUNITY_backfill-numbers.integration.test.ts|backfill-numbers.integration.test.ts]]
- [[_COMMUNITY_Bucket Assign Screen (4|Bucket Assign Screen (4]]
- [[_COMMUNITY_items.ts|items.ts]]
- [[_COMMUNITY_ui.ts|ui.ts]]
- [[_COMMUNITY_PurseInator MVP App &|PurseInator MVP App &]]
- [[_COMMUNITY_layout.tsx|layout.tsx]]
- [[_COMMUNITY_ScoringService.ts|ScoringService.ts]]
- [[_COMMUNITY_MostLovedHero.tsx|MostLovedHero.tsx]]
- [[_COMMUNITY_ItemController|ItemController]]
- [[_COMMUNITY_InviteForm.tsx|InviteForm.tsx]]
- [[_COMMUNITY_move-photos.integration.test.ts|move-photos.integration.test.ts]]
- [[_COMMUNITY_ItemFilters.tsx|ItemFilters.tsx]]
- [[_COMMUNITY_validation.ts|validation.ts]]
- [[_COMMUNITY_PurseInator MVP API Specification|PurseInator MVP API Specification]]
- [[_COMMUNITY_CI Workflow (GitHub Actions)|CI Workflow (GitHub Actions)]]
- [[_COMMUNITY_middleware-auth.ts|middleware-auth.ts]]
- [[_COMMUNITY_Bulk Upload → Photo|Bulk Upload → Photo]]
- [[_COMMUNITY_InvitationService|InvitationService]]
- [[_COMMUNITY_ScoringService|ScoringService]]
- [[_COMMUNITY_SessionCompleteScreen.tsx|SessionCompleteScreen.tsx]]
- [[_COMMUNITY_CompareChoice.tsx|CompareChoice.tsx]]
- [[_COMMUNITY_page.test.tsx|page.test.tsx]]
- [[_COMMUNITY_test-db.sh|test-db.sh]]
- [[_COMMUNITY_env.ts|env.ts]]
- [[_COMMUNITY_page.test.tsx|page.test.tsx]]
- [[_COMMUNITY_FinalizeResultForm.tsx|FinalizeResultForm.tsx]]
- [[_COMMUNITY_PairingService|PairingService]]
- [[_COMMUNITY_POST()|POST()]]
- [[_COMMUNITY_vercel.json|vercel.json]]
- [[_COMMUNITY_api-errors.ts|api-errors.ts]]
- [[_COMMUNITY_package.json|package.json]]
- [[_COMMUNITY_migrate.ts|migrate.ts]]
- [[_COMMUNITY_page.test.tsx|page.test.tsx]]
- [[_COMMUNITY_route.test.ts|route.test.ts]]
- [[_COMMUNITY_Impeccable critique — collections|Impeccable critique — /collections]]
- [[_COMMUNITY_global-setup.ts|global-setup.ts]]
- [[_COMMUNITY_global-teardown.ts|global-teardown.ts]]
- [[_COMMUNITY_route.test.ts|route.test.ts]]
- [[_COMMUNITY_run-db-tests.sh|run-db-tests.sh]]
- [[_COMMUNITY_route.test.ts|route.test.ts]]
- [[_COMMUNITY_.create()|.create()]]
- [[_COMMUNITY_ItemMetadata.tsx|ItemMetadata.tsx]]
- [[_COMMUNITY_route.test.ts|route.test.ts]]
- [[_COMMUNITY_route.test.ts|route.test.ts]]
- [[_COMMUNITY_Beads — AI-Native Issue|Beads — AI-Native Issue]]
- [[_COMMUNITY_Private-repo release-asset 404-on-anonymous-fetch fact|Private-repo release-asset 404-on-anonymous-fetch fact]]
- [[_COMMUNITY_next.config.mjs|next.config.mjs]]
- [[_COMMUNITY_load-env.js|load-env.js]]
- [[_COMMUNITY_tailwind.config.ts|tailwind.config.ts]]
- [[_COMMUNITY_Purseinator Test Reports landing|Purseinator Test Reports landing]]
- [[_COMMUNITY_CC0Public-Domain Test Image Fixtures|CC0/Public-Domain Test Image Fixtures]]
- [[_COMMUNITY_Project — set Status|Project — set Status]]

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 152 edges
2. `getSession()` - 72 edges
3. `requireAuth()` - 61 edges
4. `generateId()` - 52 edges
5. `getTestDb()` - 49 edges
6. `Item` - 47 edges
7. `PhotoRepository` - 43 edges
8. `ItemRepository` - 41 edges
9. `requireCollectionAccess()` - 37 edges
10. `Collection` - 35 edges

## Surprising Connections (you probably didn't know these)
- `Tiers Love/Like/Maybe/Onward (cool value-ramp)` --semantically_similar_to--> `Sort-ranking model: single [0,1] score, band-center seeding`  [INFERRED] [semantically similar]
  DESIGN.md → docs/ARCHITECTURE.md
- `numbersByCreatedAt()` --calls--> `getTestDb()`  [EXTRACTED]
  src/lib/db/backfill-numbers.integration.test.ts → e2e/fixtures/db.ts
- `makeService()` --calls--> `getTestDb()`  [EXTRACTED]
  src/lib/db/move-photos.integration.test.ts → e2e/fixtures/db.ts
- `itemRepo()` --calls--> `getTestDb()`  [EXTRACTED]
  src/lib/db/pool-grouping.integration.test.ts → e2e/fixtures/db.ts
- `makeService()` --calls--> `getTestDb()`  [EXTRACTED]
  src/lib/db/pool-grouping.integration.test.ts → e2e/fixtures/db.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **CI quality gates: lint/unit, DB integration, e2e** — ci_yml_gate_job, ci_yml_db_tests_job, ci_yml_e2e_job, plans_e2e_ui_testing_playwright [EXTRACTED 0.75]
- **Phased decision flow: triage → pairwise → results** — product_md_phased_flow, purseinator_app_infra_spec_decision_event, purseinator_app_infra_spec_scoring_model, plans_sort_ranking_model_two_pass, plans_phase_4_react_ui_sort_state_machine [INFERRED 0.80]
- **Adored Full Sort-to-Result Flow (triage → compare → bucket → review → finalize)** — docs_adored_wireframes_triage_fast_list_screen, docs_adored_wireframes_compare_head_to_head_screen, docs_adored_wireframes_bucket_assign_screen, docs_adored_wireframes_review_results_draft_screen, docs_adored_wireframes_finalize_results_screen [INFERRED 0.85]
- **Adored Results Review Sub-flow (draft → re-rank → finalize → share)** — docs_adored_wireframes_review_results_draft_screen, docs_adored_wireframes_manual_rerank_screen, docs_adored_wireframes_finalize_results_screen, docs_adored_wireframes_shared_results_readonly_screen [INFERRED 0.85]
- **Governance doc hierarchy (TONE first-order, PRODUCT why, DESIGN visual)** — tone_doc, product_doc, design_doc, architecture_doc [INFERRED 0.85]
- **Photo pool integrity flow (no-txn guard + blob client-upload + reassign)** — architecture_photo_pool, architecture_neon_no_txn_guard, architecture_blob_client_upload, architecture_reassign_one_op [INFERRED 0.85]
- **TONE guardrails realized in deferred-metadata UX** — tone_object_is_story, tone_unpressured_forgiving, architecture_deferred_metadata_guardrails [INFERRED 0.85]

## Communities (97 total, 23 thin omitted)

### Community 0 - "Domain types & barrels"
Cohesion: 0.06
Nodes (21): PhotoController, UpdatePhotoInput, UpdatePhotoSchema, PhotoRepository, PhotoGallery(), PhotoGalleryProps, OTHER_ITEMS, PHOTOS (+13 more)

### Community 1 - "Sort results & ranking"
Cohesion: 0.06
Nodes (21): ResultItemController, UpdateResultItemInput, UpdateResultItemSchema, CreateResultInput, CreateResultSchema, ResultController, UpdateResultInput, UpdateResultSchema (+13 more)

### Community 2 - "DB access layer"
Cohesion: 0.10
Nodes (41): POST(), GET(), POST(), requireApiResultAccess(), POST(), requireAuth(), getDb(), GET() (+33 more)

### Community 3 - "Authorization guards"
Cohesion: 0.07
Nodes (36): CollectionForm(), EditCollectionPage(), EditPageProps, ItemEditPage(), ItemEditPageProps, FinalizePage(), FinalizePageProps, { mockGetSession, mockRequireAccess, redirectMock, resultRepo } (+28 more)

### Community 4 - "Architecture & project docs"
Cohesion: 0.06
Nodes (56): Visual regression & UI screenshots exploration, Deterministic e2e seed (pinned IDs, frozen clock) prerequisite, VRT options: hosted (Argos/Chromatic) vs Playwright-native toHaveScreenshot, Capture rationale before deleting (sequencing rule), Docs audit + cleanup design, Docs ARCHITECTURE.md + cleanup implementation plan (v2), Keep legacy purseinator_* specs (post adversarial-review), Adored (curatorial collection sorting app) (+48 more)

### Community 5 - "Collections domain"
Cohesion: 0.07
Nodes (18): CollectionController, CreateCollectionInput, CreateCollectionSchema, PurgeConfirmSchema, UpdateCollectionInput, UpdateCollectionSchema, CollectionCard(), CollectionCardProps (+10 more)

### Community 6 - "Database / Drizzle schema"
Cohesion: 0.06
Nodes (13): CreateShareInput, CreateShareSchema, ShareController, UpdateShareInput, UpdateShareSchema, sortResultSharesTable, SortResultShareRepository, Database (+5 more)

### Community 7 - "Sort sessions"
Cohesion: 0.08
Nodes (17): CreateSessionInput, CreateSessionSchema, SessionController, UpdateSessionInput, UpdateSessionSchema, authorizeSession(), db, { selectWhere, insertReturning } (+9 more)

### Community 8 - "App Router pages"
Cohesion: 0.10
Nodes (30): ComparePage(), ComparePageProps, ItemDetailPage(), ItemDetailPageProps, bucketDots, bucketLabels, ItemCard(), ItemsPage() (+22 more)

### Community 9 - "Auth & sessions"
Cohesion: 0.08
Nodes (28): Home(), CollectionsPage(), requireApiCollectionAccess(), { collectionRepo, membershipRepo }, db, POST(), GET(), POST() (+20 more)

### Community 10 - "DB connection"
Cohesion: 0.15
Nodes (15): CollectionsPageProps, ItemRepository, MembershipRepository, ItemUpdateRequest, authOptions, Session, UnauthorizedError, client (+7 more)

### Community 11 - "ID generation"
Cohesion: 0.12
Nodes (20): account, collectionsTable, decisionEventsTable, itemsTable, membershipsTable, photosTable, preferencesTable, session (+12 more)

### Community 12 - "PoolUpload.tsx"
Cohesion: 0.10
Nodes (22): PhotoUpload(), PhotoUploadProps, canvasToJpegBlob(), convertHeifToJpeg(), loadImage(), buildJpegFileName(), HEIF_MIME_TYPES, isHeifFile() (+14 more)

### Community 13 - "seed.ts"
Cohesion: 0.14
Nodes (17): { mockGetSession, mockBlobGet }, itemRepo(), makeService(), photoRepo(), seedPooled(), formatTransportError(), hasNestedErrors(), step() (+9 more)

### Community 14 - "getTestDb()"
Cohesion: 0.15
Nodes (20): itemRepo(), photoRepo(), seedCollection(), seedPhoto(), repo(), seedOwner(), itemRepo(), photoRepo() (+12 more)

### Community 15 - "static-coverage.mjs"
Cohesion: 0.08
Nodes (18): all, allTestBody, byDir, files, gaps, importStems, nameRefCache, results (+10 more)

### Community 16 - "compilerOptions"
Cohesion: 0.08
Nodes (25): compilerOptions, allowJs, allowSyntheticDefaultImports, esModuleInterop, forceConsistentCasingInFileNames, incremental, isolatedModules, jsx (+17 more)

### Community 17 - "User"
Cohesion: 0.17
Nodes (7): UpdateUserInput, UpdateUserSchema, UserController, UserRepository, IUserRepository, UserService, User

### Community 18 - "devDependencies"
Cohesion: 0.08
Nodes (24): devDependencies, autoprefixer, culori, esbuild-register, eslint, eslint-config-next, jsdom, @playwright/test (+16 more)

### Community 19 - "CollectionForm.tsx"
Cohesion: 0.15
Nodes (13): collectionSchema, UseCollectionResult, ItemForm(), itemSchema, apiDelete(), apiFetch(), apiGet(), apiPatch() (+5 more)

### Community 20 - "CollectionMembership"
Cohesion: 0.13
Nodes (5): MemberController, MemberList(), MemberListProps, DerivedPermissions, CollectionMembership

### Community 21 - "dependencies"
Cohesion: 0.10
Nodes (21): dependencies, @auth/drizzle-adapter, bcryptjs, class-variance-authority, dotenv, drizzle-kit, drizzle-orm, next (+13 more)

### Community 22 - "Item"
Cohesion: 0.16
Nodes (5): ItemCardProps, ItemEditFormProps, ItemFormProps, ItemService, Item

### Community 23 - "index.ts"
Cohesion: 0.17
Nodes (12): Checkbox, CheckboxProps, ConfirmDialog, ConfirmDialogProps, InputProps, LoadingSpinner, LoadingSpinnerProps, sizeMap (+4 more)

### Community 24 - "members.ts"
Cohesion: 0.17
Nodes (7): CreateMemberInput, CreateMemberSchema, UpdateMemberInput, UpdateMemberSchema, IMembershipRepository, PermissionFlags, MembershipService

### Community 25 - "scripts"
Cohesion: 0.11
Nodes (18): scripts, auth:verify, build, db:backfill-numbers, db:backfill-slugs, db:generate, db:migrate, dev (+10 more)

### Community 26 - "domain.ts"
Cohesion: 0.13
Nodes (13): buildService(), scoreByItem(), ApiResponse, CollectionStatus, DecisionType, InvitationStatus, MembershipRole, PairwiseResult (+5 more)

### Community 27 - "Invitation"
Cohesion: 0.24
Nodes (5): GET(), POST(), invitationsTable, InvitationRepository, Invitation

### Community 28 - "invitations.ts"
Cohesion: 0.13
Nodes (6): CreateInvitationInput, CreateInvitationSchema, InvitationController, UpdateInvitationInput, UpdateInvitationSchema, IInvitationRepository

### Community 29 - "route.ts"
Cohesion: 0.23
Nodes (3): PreferenceController, ICollectionPreferenceItemRepository, PreferenceStateService

### Community 30 - "Project Instructions for AI"
Cohesion: 0.17
Nodes (15): Beads Repository Configuration, Adversarial Review Gate (lens → engine routing), Project Instructions for AI Agents (CLAUDE.md), Beads (bd) Issue Tracker, Feature Branch → PR → Squash-Merge Workflow, DB-Backed Tests (RUN_DB_TESTS=1, CI db-tests job), Align with Next.js Opinions (App Router conventions), PRODUCT.md — Realizing What You Love (affirmation, not discard) (+7 more)

### Community 31 - "Button"
Cohesion: 0.16
Nodes (10): CollectionFilters(), CollectionFiltersProps, filters, DecisionControls(), DecisionControlsProps, Button, ButtonProps, buttonVariants (+2 more)

### Community 32 - "route.ts"
Cohesion: 0.20
Nodes (5): {
  mockGetSession,
  mockGetDb,
  membershipRepo,
  collectionRepo,
  createItemFromPool,
  createItemsFromPoolEach,
}, POST(), {
  mockGetSession,
  mockGetDb,
  membershipRepo,
  collectionRepo,
  reassignPhotos,
}, PoolGroupError, ReassignDest

### Community 33 - "DecisionEvent"
Cohesion: 0.20
Nodes (5): DecisionEventRepository, DecisionEventService, SessionAnalytics(), SessionAnalyticsProps, DecisionEvent

### Community 34 - "Input"
Cohesion: 0.14
Nodes (6): ItemEditForm(), SharePanel(), StartSessionForm(), StartSessionFormProps, push, Input

### Community 35 - "CollectionPreferenceItem"
Cohesion: 0.25
Nodes (3): CollectionPreferenceItemRepository, SelectionOptions, CollectionPreferenceItem

### Community 36 - "AppLayout.tsx"
Cohesion: 0.19
Nodes (9): AppLayoutProps, BreadcrumbItem, BreadcrumbItem, Breadcrumbs(), BreadcrumbsProps, Header(), PageContainer, PageContainerProps (+1 more)

### Community 37 - "append-history.mjs"
Cohesion: 0.14
Nodes (9): cov, covCells, durCells, e2e, entry, histPath, rows, sha (+1 more)

### Community 38 - "page.tsx"
Cohesion: 0.17
Nodes (5): collections, BadgeProps, badgeVariants, CardProps, paddingMap

### Community 39 - "backfill-numbers.integration.test.ts"
Cohesion: 0.24
Nodes (9): backfillNumbers(), backfillTable(), numbersByCreatedAt(), rawSession(), seedOwner(), NumberedTable, sessionsTable, sortResultsTable (+1 more)

### Community 40 - "Bucket Assign Screen (4"
Cohesion: 0.26
Nodes (12): Bucket Assign Screen (4 ranked buckets + Skip), Compare Head-to-Head Screen (variation A), Compare the Line / Love Boundary Screen (variation B), DecisionEvent Sorting Data Model, Finalize Results Screen, Manual Re-rank by Hand Screen, Viewer Sees Output Only, Never Raw Decisions (sharing rationale), Review Results Draft Screen (+4 more)

### Community 41 - "items.ts"
Cohesion: 0.22
Nodes (6): CreateItemInput, CreateItemSchema, UpdateItemInput, UpdateItemSchema, IItemRepository, PairingResult

### Community 42 - "ui.ts"
Cohesion: 0.38
Nodes (6): BASELINE_USER, hasHorizontalOverflow(), LOGGED_OUT, ROUTE, sessionEmail(), submitLogin()

### Community 43 - "PurseInator MVP App &"
Cohesion: 0.22
Nodes (11): PurseInator MVP App & Infrastructure Spec, Internal buckets: top/high/medium/low, CollectionMembership — authorization source of truth, DecisionEvent — append-only source of truth, CollectionPreferenceItem — derived curator preference state, Runtime stack — Next.js, Neon Postgres, Drizzle, Vercel Blob, Scoring Model — triage seed + pairwise adjustment, Server-side authorization rules (+3 more)

### Community 44 - "layout.tsx"
Cohesion: 0.28
Nodes (5): inter, metadata, playfair, SessionProviderWrapper(), ThemeScript()

### Community 45 - "ScoringService.ts"
Cohesion: 0.42
Nodes (5): IDecisionEventRepository, ItemState, TIER_SEED, PairwiseDecision, TriageDecision

### Community 46 - "MostLovedHero.tsx"
Cohesion: 0.28
Nodes (5): MostLovedHero(), MostLovedHeroProps, item, CardImage(), CardImageProps

### Community 48 - "InviteForm.tsx"
Cohesion: 0.29
Nodes (6): InviteForm(), InviteFormProps, inviteSchema, PermissionCheckboxes(), PermissionCheckboxesProps, permissionDescriptions

### Community 49 - "move-photos.integration.test.ts"
Cohesion: 0.38
Nodes (5): itemRepo(), makeService(), photoRepo(), seedItem(), seedPhoto()

### Community 50 - "ItemFilters.tsx"
Cohesion: 0.38
Nodes (4): filters, ItemFilters(), ItemFiltersProps, itemsUrl()

### Community 51 - "validation.ts"
Cohesion: 0.29
Nodes (3): DecisionEventSchema, PairwiseDecisionSchema, TriageDecisionSchema

### Community 52 - "PurseInator MVP API Specification"
Cohesion: 0.29
Nodes (7): PurseInator MVP API Specification, DecisionEvents Immutable & Append-Only (triage / pairwise_compare), Permissions on CollectionMembership (not User), One Active Session per Curator per Collection, Result Sharing via Share Token (finalized output only), Soft Delete vs Purge (blob cleanup on purge), SortResults — Draft/Finalize/Supersede + Manual Re-Rank

### Community 53 - "CI Workflow (GitHub Actions)"
Cohesion: 0.33
Nodes (6): CI Workflow (GitHub Actions), db-tests job — RUN_DB_TESTS against Postgres 16 service, deploy-report — gh-pages reports dashboard, e2e job — Playwright, UI-change gated, gate job — lint, unit test, build, dorny/paths-filter UI-change detection

### Community 54 - "middleware-auth.ts"
Cohesion: 0.47
Nodes (3): isRequestAuthorized(), SESSIONLESS_POST_ROUTES, config

### Community 55 - "Bulk Upload → Photo"
Cohesion: 0.40
Nodes (6): Bulk Upload → Photo Pool → Grouped Items Design, Per-collection catalog number for item URLs, Deferred metadata — nullable name, optional fields, Durable photo pool (item_id NULL, Blob client upload), onUploadCompleted crash-safe seam, ULID primary keys (collision-proof, time-sortable)

### Community 58 - "SessionCompleteScreen.tsx"
Cohesion: 0.40
Nodes (4): SessionCompleteScreen(), SessionCompleteScreenProps, props, push

### Community 59 - "CompareChoice.tsx"
Cohesion: 0.40
Nodes (3): CompareChoice(), CompareChoiceProps, Result

### Community 60 - "page.test.tsx"
Cohesion: 0.40
Nodes (4): A, B, COLLECTION, { mockGetSession, mockRequireAccess, itemRepo, sessionRepo, prefRepo, decisionRepo, photoRepo }

### Community 61 - "test-db.sh"
Cohesion: 0.60
Nodes (4): DATABASE_URL_TEST, down(), up(), test-db.sh script

### Community 62 - "env.ts"
Cohesion: 0.40
Nodes (3): env, EnvConfig, envSchema

### Community 63 - "page.test.tsx"
Cohesion: 0.40
Nodes (4): COLLECTION, HERO, { mockGetSession, mockRequireAccess, redirectMock, resultRepo, resultItemRepo, itemRepo, shareRepo, photoRepo }, REST

### Community 64 - "FinalizeResultForm.tsx"
Cohesion: 0.50
Nodes (3): FinalizeResultForm(), FinalizeResultFormProps, push

### Community 66 - "POST()"
Cohesion: 0.50
Nodes (4): POST(), call(), { mockGetSession, mockGetDb, itemRepo, photoRepo, collectionRepo, membershipRepo }, params

### Community 67 - "vercel.json"
Cohesion: 0.40
Nodes (4): gh-pages, git, deploymentEnabled, $schema

### Community 68 - "api-errors.ts"
Cohesion: 0.83
Nodes (3): errorResponse, formatZodErrors(), handleError()

### Community 69 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 71 - "page.test.tsx"
Cohesion: 0.50
Nodes (3): COLLECTION, ITEM, { mockGetSession, mockRequireAccess, itemRepo, sessionRepo, prefRepo, photoRepo }

### Community 73 - "Impeccable critique — /collections"
Cohesion: 0.67
Nodes (3): Impeccable critique — /collections home, Strangeness-of-register: catalog/inventory grid risk, Every card shows '0 items' — status lies

## Knowledge Gaps
- **341 isolated node(s):** `cov`, `e2e`, `sha`, `ts`, `histPath` (+336 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **23 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `DB access layer` to `route.ts`, `POST()`, `Authorization guards`, `Database / Drizzle schema`, `Sort sessions`, `App Router pages`, `Auth & sessions`, `DB connection`, `ID generation`, `PoolUpload.tsx`, `Invitation`, `route.ts`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Why does `Photo` connect `Domain types & barrels` to `App Router pages`, `DB connection`, `domain.ts`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `generateId()` connect `ID generation` to `Domain types & barrels`, `Sort results & ranking`, `DB access layer`, `CollectionPreferenceItem`, `Collections domain`, `Database / Drizzle schema`, `backfill-numbers.integration.test.ts`, `Sort sessions`, `DB connection`, `PoolUpload.tsx`, `seed.ts`, `getTestDb()`, `ScoringService.ts`, `.create()`, `CollectionMembership`, `Invitation`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Are the 33 inferred relationships involving `getDb()` (e.g. with `EditCollectionPage()` and `ItemEditPage()`) actually correct?**
  _`getDb()` has 33 INFERRED edges - model-reasoned connections that need verification._
- **Are the 19 inferred relationships involving `requireAuth()` (e.g. with `GET()` and `POST()`) actually correct?**
  _`requireAuth()` has 19 INFERRED edges - model-reasoned connections that need verification._
- **What connects `cov`, `e2e`, `sha` to the rest of the system?**
  _350 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Domain types & barrels` be split into smaller, more focused modules?**
  _Cohesion score 0.05970149253731343 - nodes in this community are weakly interconnected._