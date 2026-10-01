# Tutorials Area Plan

## Task 1: Shared Tutorial Metadata

- Add a small tutorial metadata module with the four titles, descriptions, hrefs, and status.
- Keep wording aligned to the requested IA:
  - `Start a collection`: creating a collection, adding photos, making items.
  - `Sort and refine`: current tutorial, complete.
  - `Invite and share`: invite people to a collection, share finalized results.
  - `Round timers`: round length, no timer, timer expiry, taking a break.

## Task 2: Routes

- Add `/tutorials` index.
- Move the current public tutorial wrapper to `/tutorials/sort`.
- Change `/tutorial` to redirect to `/tutorials/sort`.
- Add simple placeholder pages for `/tutorials/collection`, `/tutorials/sharing`, and `/tutorials/timers`.
- Update `src/proxy.ts` so `/tutorials` and `/tutorials/*` are public.

## Task 3: Profile Entry Point

- Replace the "New to Adored?" row in `ProfileForm` with the Tutorials section.
- Preserve the Profile page header and existing profile/theme/delete account surfaces.
- Keep tap targets at least `h-11`.

## Task 4: Tests

- Update `ProfileForm.test.tsx` for the Tutorials section and links.
- Update `/tutorial` route test to assert redirect.
- Add `/tutorials` route tests for index, sort, and placeholder pages.
- Add/extend Playwright coverage for Profile -> Tutorials -> Sort and `/tutorial` redirect.

## Task 5: Verification

- Focused unit tests for profile/tutorial pages.
- Mapped Playwright locally on tablet and phone.
- Full required pre-PR local gates before opening PR: lint, test:ci, build.
- Update graphify before PR if code changes are committed.
