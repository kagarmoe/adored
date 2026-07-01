<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into Adored (Next.js 14.2.3, App Router). A client-side provider initialises `posthog-js` and auto-identifies users from the NextAuth session. Twelve business events are captured across both client and server, covering the full curation lifecycle — from signup through pairwise sorting to sharing results. A reverse proxy through Next.js rewrites routes all PostHog traffic through `/ingest/` to reduce ad-blocker interception.

## Events instrumented

| Event name | Description | File |
|---|---|---|
| `user_signed_up` | New account created via signup form | `src/app/signup/page.tsx` (client) |
| `user_signed_up` | New account created server-side | `src/app/api/auth/signup/route.ts` (server) |
| `user_logged_in` | User signed in via password | `src/app/login/page.tsx` (client) |
| `collection_created` | New collection created | `src/app/api/collections/route.ts` (server) |
| `photo_uploaded` | Photo uploaded to a collection pool | `src/app/api/collections/[id]/pool/upload/route.ts` (server) |
| `sort_session_created` | Sorting session started | `src/app/api/sessions/route.ts` (server) |
| `sort_decision_recorded` | Triage / pairwise / bucket decision recorded | `src/app/api/sessions/[id]/decisions/route.ts` (server) |
| `pairwise_decision_made` | User tapped a choice in the compare UI | `src/features/sorting/CompareChoice.tsx` (client) |
| `sort_result_finalized` | Sort result locked and finalized | `src/app/api/sort-results/[id]/finalize/route.ts` (server) |
| `sort_result_shared` | Finalized result shared externally | `src/app/api/sort-results/[id]/shares/route.ts` (server) |
| `invitation_sent` | Collaboration invitation sent | `src/app/api/collections/[id]/invitations/route.ts` (server) |
| `invitation_accepted` | Invitation accepted via token link | `src/app/api/invitations/accept/route.ts` (server) |

## Infrastructure changes

| File | Change |
|---|---|
| `src/lib/posthog-server.ts` | New — `getPostHogClient()` factory for server-side `posthog-node` |
| `src/components/PostHogProvider.tsx` | New — client-side init, pageview tracking, and session-based `posthog.identify()` |
| `src/app/layout.tsx` | Added `PostHogProvider` inside `SessionProviderWrapper` |
| `next.config.mjs` | Added `/ingest/*` reverse-proxy rewrites + `skipTrailingSlashRedirect: true` |
| `src/types/next-auth.d.ts` | New — extends NextAuth `Session` type to include `user.id` |
| `.env.local` | Added `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` |

## Next steps

We've built insights and a dashboard to keep an eye on user behaviour, based on the events just instrumented:

- **Dashboard:** [Analytics basics (wizard)](https://us.posthog.com/project/492712/dashboard/1782362)
- [Signups over time (wizard)](https://us.posthog.com/project/492712/insights/QmUZpPwV) — daily unique signups
- [Sorting engagement (wizard)](https://us.posthog.com/project/492712/insights/UtwKST05) — pairwise decisions + results finalized
- [Collections and photos created (wizard)](https://us.posthog.com/project/492712/insights/vHTUSLRZ) — content growth
- [Sharing and invitations (wizard)](https://us.posthog.com/project/492712/insights/gnLqvxqX) — viral/collaborative signals
- [Curation funnel: signup → finalized result (wizard)](https://us.posthog.com/project/492712/insights/RuDxvlIR) — end-to-end conversion funnel

## Verify before merging

- [ ] Run a full production build (`npm run build`) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite (`npm run test:ci`) — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` to `.env.example` and any project bootstrap docs so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or equivalent) into CI so production stack traces de-minify in PostHog Error Tracking.
- [ ] Confirm the returning-visitor path also calls `identify` — `PostHogAuthSync` identifies on every authenticated session load, but verify it fires correctly for users who were already logged in before this integration was deployed.

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-nextjs-app-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
