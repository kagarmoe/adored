# Rename: PurseInator → Adored

**Status:** Executed (this PR)
**Decision:** see `product-name-adored` memory; "PurseInator" was always a placeholder.
**Date:** 2026-06-09

## Scope (chosen: display + technical + living docs)

**Tier 1 — display brand**
- `src/components/layout/Header.tsx` — wordmark + `aria-label="Adored home"`
- `src/components/layout/AppLayout.tsx` — footer `Adored · take all the time you need`
- `src/app/layout.tsx` — page `<title>`
- `src/app/{login,signup,page,shared-preview}` — visible copy

**Tier 2 — technical identifiers**
- `package.json` + `package-lock.json` — `name: adored`
- `src/lib/env.ts` + `.env.example` — `EMAIL_FROM` default → `noreply@adored.kimberlygarmoe.com`; example DB → `adored`
- `e2e/fixtures/seed.ts` + `e2e/auth.spec.ts` — test email domain → `@adored.test`

**Tier 3 — living docs**
- `README.md`, `PRODUCT.md`, `TONE.md`, `DESIGN.md`, `.claude/CLAUDE.md`
- `docs/PurseInator_wireframes.pdf` → `docs/Adored_wireframes.pdf` (renamed so the CLAUDE.md link stays valid; PDF *contents* still show the old name — it's a historical reference)

## Deliberately NOT renamed
- **Historical** `docs/plans/*` and `.impeccable/` snapshots — dated records; renaming falsifies history.
- **Beads prefix** `purses-` — renaming rewrites every issue ID; out of scope.
- **Repo name** `purseinator-app` — GitHub rename is external; references to `purseinator-app` (clone URLs etc.) intentionally left until/if the repo is renamed.

## External steps YOU drive (post-merge / deploy) — checklist

Deploy target: **adored.kimberlygarmoe.com** (subdomain you own — no domain purchase needed).

- [ ] **Resend:** add & verify the sending domain for `noreply@adored.kimberlygarmoe.com` (SPF/DKIM/DMARC DNS records) **before** relying on auth / magic-link emails — otherwise they silently fail. If you keep an already-verified domain instead, set `EMAIL_FROM` to that and skip.
- [ ] **Vercel:** set the production domain to `adored.kimberlygarmoe.com`; update `AUTH_URL` env to `https://adored.kimberlygarmoe.com` (NextAuth callback base). Optionally rename the Vercel project.
- [ ] **DNS:** point `adored.kimberlygarmoe.com` (CNAME) at Vercel.
- [ ] (Optional) Rename the GitHub repo `purseinator-app` → `adored`; update local remote.
- [ ] (Optional, deliberate) Rename beads prefix `purses-` → `adored-` via `bd rename-prefix` if desired (rewrites issue IDs).

## Verification (this PR)
- Scoped sed; confirmed zero `PurseInator` left in in-scope files; historical plan docs still carry the old name (expected).
- Gates: lint / test:ci / build / auth:verify.
- Screenshot: `/login` (public) showing the new wordmark.
