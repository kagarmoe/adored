# Rename: PurseInator → Adored

**Status:** Executed (this PR). Vercel config applied.

**Decision:** see `product-name-adored` memory; "PurseInator" was always a placeholder.

**Date:** 2026-06-09

## Scope (chosen: display + technical + living docs)

### Tier 1 — display brand

- `src/components/layout/Header.tsx` — wordmark + `aria-label="Adored home"`
- `src/components/layout/AppLayout.tsx` — footer `Adored · take all the time you need`
- `src/app/layout.tsx` — page `<title>`
- `src/app/{login,signup,page,shared-preview}` — visible copy

### Tier 2 — technical identifiers

- `package.json` + `package-lock.json` — `name: adored`
- `src/lib/env.ts` + `.env.example` — `EMAIL_FROM` default → `noreply@kimberlygarmoe.com` (see Email note); example DB → `adored`
- `e2e/fixtures/seed.ts` + `e2e/auth.spec.ts` — test email domain → `@adored.test`

### Tier 3 — living docs

- `README.md`, `PRODUCT.md`, `TONE.md`, `DESIGN.md`, `.claude/CLAUDE.md`
- `docs/PurseInator_wireframes.pdf` → `docs/Adored_wireframes.pdf` (renamed so the CLAUDE.md link stays valid; PDF *contents* still show the old name — it's a historical reference)

## Deliberately NOT renamed

- **Historical** `docs/plans/*` and `.impeccable/` snapshots — dated records; renaming falsifies history.
- **Beads prefix** `purses-` — renaming rewrites every issue ID; out of scope.
- **Repo name** `purseinator-app` — GitHub rename is external; references to `purseinator-app` (clone URLs etc.) intentionally left until/if the repo is renamed.

## Email / Resend (resolved)

Resend already has **`kimberlygarmoe.com` verified**. Resend authorizes the *exact* domain, so a subdomain sender (`@adored.kimberlygarmoe.com`) would need its own verification. To require **zero Resend/DNS work**, `EMAIL_FROM` sends from the verified apex: **`noreply@kimberlygarmoe.com`** (`src/lib/auth.ts` feeds it to the NextAuth email provider). No Resend change needed.

## Vercel config (applied)

- `AUTH_URL` (Production) → `https://adored.kimberlygarmoe.com` ✓
- Domain `adored.kimberlygarmoe.com` attached to the project, **live with SSL** (zone is Vercel-managed, so no external DNS step) ✓
- `EMAIL_FROM` is not a Vercel env var — the code default above governs it ✓

## Still external (optional)

- Rename the GitHub repo `purseinator-app` → `adored`; update local remote.
- Rename beads prefix `purses-` → `adored-` via `bd rename-prefix` (rewrites issue IDs) — deliberate, only if wanted.

## Verification (this PR)

- Scoped sed; confirmed zero `PurseInator` left in in-scope files; historical plan docs still carry the old name (expected).
- Gates: lint / test:ci / build / auth:verify.
- Screenshot: `/login` (public) showing the new wordmark.
