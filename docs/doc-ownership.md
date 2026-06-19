# Doc ownership map

Which source areas assert facts in which governance docs. `/sync-docs` and the
`.githooks/pre-push` doc-sync step read the block below. Each line is
`path-or-dir/ :: doc, doc` — a trailing `/` means "this directory and below".
PRODUCT.md and TONE.md are intentionally absent: first-order contracts, edited
deliberately, never auto-synced. An over-broad or stale entry is a `--no-verify`
+ a map fix — never a reason to weaken a doc.

<!-- ownership:start -->
src/lib/env.ts :: README.md, docs/ARCHITECTURE.md
src/lib/auth.ts :: README.md, docs/ARCHITECTURE.md
src/middleware.ts :: docs/ARCHITECTURE.md
src/lib/db/schema.ts :: README.md, docs/ARCHITECTURE.md, docs/purseinator_app_infra_spec.md
drizzle/ :: docs/ARCHITECTURE.md
src/server/dal/ :: docs/ARCHITECTURE.md
src/server/repositories/ :: docs/ARCHITECTURE.md
src/lib/design/ :: DESIGN.md
src/app/globals.css :: DESIGN.md
vercel.json :: docs/DEPLOYMENT.md
.github/workflows/ :: docs/ARCHITECTURE.md, docs/DEPLOYMENT.md
<!-- ownership:end -->
