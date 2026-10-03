# Adored — feature inventory

What the product does, as a person experiences it. Compiled 2026-10-01 from PRODUCT.md,
TONE.md, the governance docs, and every spec and plan written for PurseInator/Adored
(now under `docs/archive/`). Implementation detail is deliberately left out.

Status tags: **[shipped]** in the app today · **[planned]** designed but not built ·
**[dropped]** decided against · **[api-only]** the capability exists but no screen reaches it.

## Account and access
- Sign in with Google; the session survives return visits. [shipped]
- Signed-out visitors go to the login page; old sign-up links redirect there. [shipped]
- Profile page: set or clear a display name. [shipped]
- Delete your account: removes collections you own and scrubs your personal details. [shipped]
- Email + password, magic-link, and password reset. [dropped — Google only]

## Collections
- Create, edit, and list collections, including ones you were invited into. [shipped]
- Readable addresses: collection names in the URL; items, sessions, and results numbered. [shipped]
- Collection cards show a real cover photo. [shipped]
- A "Photos waiting" cue on the collections list. [shipped]
- The collection home adapts to what you have: photo pool first, items first, or empty. [shipped]
- Build / Sort / Decide mode chips on section pages. [shipped]
- One main action at a time on the home: Start sorting / Keep sorting / Add photos. [shipped]
- Owner deletes a collection from Settings by typing its name; permanent. [shipped]
- Archive and restore a collection. [api-only]
- Owner-only record of permanent deletions. [api-only]

## Items (objects)
- Items may be named or nameless; each gets a number. [shipped]
- Gentle prompts for missing details ("Add a name", "Tell its story"); never counts, never "incomplete". [shipped]
- "Waiting for a name" filter, off by default. [shipped]
- Item page with a photo carousel and a details card; a separate edit page for metadata
  (name, brand, style, color, material, category, dimensions, weight, story). [shipped]
- Remove an item from its page, with undo on the collection home. [shipped]
- Permanently delete an item, or detach it from draft results first. [api-only]

## Photos
- Upload many photos at once into a per-collection pool; add details later. [shipped]
- Turn pooled photos into one item, or one item each. [shipped]
- "Move to…": regroup photos, split them, or send them back to the pool. [shipped]
- Choose an item's main photo. [shipped]
- Delete a photo. [shipped]
- Rotate a photo (original kept) and zoom in a viewer. [shipped]
- Pool polish: "Cover" badge, success notices with links, visible 50-photo limit. [shipped]
- Photos load fast (resized and cached). [shipped]
- Client-side background removal. [dropped]

## Stories and metadata
- Optional "Tell its story" field and a "Where will it go next?" keepsake prompt. [shipped]
- "Who would love this?" rehome note on Onward items. [planned]
- Story memento (photo + caption) on Onward items. [planned]
- Voice capture / dictated stories. [planned]

## Sorting and decisions
- Each person sorts privately, even in a shared collection. [shipped]
- Triage by feeling: Love / Like / Maybe / Onward. [shipped]
- Usage round, "Do you use this?": In your life / Resting. [shipped]
- Compare round, "Which would you reach for first?": pick one of two, with Tie and Skip. [shipped]
- Compare can run on its own, not only after triage. [shipped]
- Short timed rounds: quiet ring timer with a dial (30 s to 5 min) or no timer; gold
  "round complete" moment; "what moved" recap after each round. [shipped]
- Sort hub recommends the next round, keeps the others as secondary choices, help dialog. [shipped]
- Progress on the hub and "See your ranking so far" after every round. [shipped]
- "Not mine": set an item aside without judging it. [shipped]
- "Not yet": defer an item to the end of the pass; it returns calmly. [shipped]
- Bring set-aside items back. [shipped]
- Pause ("Take a break") and resume; set a session aside with undo; start a new sort after. [shipped]
- No tap waits on the server; progress survives reload or crash. [shipped]
- Re-ask usage for items already answered. [planned]
- Swipe-based "Useful" round. [dropped — no swiping]

## Results and ranking
- Live standing: "What you love most" first, tier rows, an Onward section. [shipped]
- Usage notes on ranked items, with a "Loved, and resting" view. [shipped]
- Turn the standing into a draft, name it, finalize it; finalized results lock, revisions allowed. [shipped]
- Hand-reorder a draft by drag or up/down, across tiers; reset to suggested order. [shipped]
- Every ranking shows each item's photo. [shipped]

## Sharing and members
- Share a finalized result by public link; viewers see photos without signing in. [shipped]
- Stop sharing, with undo; links can expire. [shipped]
- Invite by email; copy an invite link; resend or cancel; owner told if an email fails. [shipped]
- Welcoming accept page that names who invited you. [shipped]
- Two roles, owner and curator; only the owner manages members. [shipped]
- Nine per-member permission switches. [dropped]

## Onboarding and tutorials
- First-run walkthrough with sample objects: Purpose → Triage → Usage → Compare → Standing → Hand-off. [shipped]
- Tutorials area from Profile: Start a collection, Sort and refine, Invite and share, Round timers. [shipped]
- Full interactive versions of the non-sort tutorials. [planned]

## Accessibility, responsive, visual
- Tablet-first, tap-first, ≥44 px targets, no swiping. [shipped]
- A phone layout for every page. [shipped]
- Light and dark "Sea Glass" themes. [shipped]
- WCAG 2.1 AA, reduced-motion honored, automated accessibility scans in CI. [shipped]
- Back arrow and breadcrumbs on every page. [shipped]

## Operations
- Health endpoint; on-demand prod health check (`swamp workflow run adored-health`). [shipped]
- Vercel Speed Insights and Web Analytics. [shipped]
- Slow-query logging, recompute benchmark gate in CI, monitoring runbook. [shipped]
- Demo data loader and sample images. [shipped]
- Visual-regression screenshot tests. [planned]
- PostHog analytics. [dropped]

---
Archived material (`docs/archive/`): every merged spec and plan, the 2026-07-12 deps handoff, the
2026-06-19 sort-flow diagnosis, and the deferred visual-regression plan. Still live under `docs/`:
the governance docs in `doc-ownership.md`, runbooks, cookbook, teaching notes, the phone-layout
coverage contract, and the design-system wireframes.
