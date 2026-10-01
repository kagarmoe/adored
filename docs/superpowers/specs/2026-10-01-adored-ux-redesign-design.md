# Adored UX redesign — design spec

Date: 2026-10-01 · Status: draft for owner review · Owner decisions already taken: PRODUCT.md and
TONE.md v2 (pre-marketplace framing), visual direction **Frosted shelf** (chosen in the brainstorm
companion, `.superpowers/brainstorm/97702-1790837089/content/visual-directions.html`).

## 1. Why

The current app works but is too complicated to use:

- Editing one object is spread over four screens (details, edit, photos, lightbox) with three ways
  to reach Edit, two upload widgets, "Hero" vs "Cover", and fields that are stored but never shown
  (height, width, depth, weight, unit).
- A first sort takes 9 to 12 screens: a goal form whose scope is ignored, a hub, three rounds each
  with a recap, two pause controls, three ways to start, four ways to resume, and "set aside"
  meaning four different things.
- Results exist in three states and every "See results" tap creates another draft.

The owner wants the app recognisable to people who use eBay, Poshmark, Vinted, and Vestiaire,
but cozier, because Adored is the step before a marketplace.

## 2. Goals and non-goals

Goals

1. One item panel: carousel plus every field, editable in place; photos added, removed, reordered,
   zoomed there; rare actions (archive, delete) in an overflow menu.
2. One sort path: start in one tap, decide on one screen, see a live ranking, save and share once.
3. A modern, cozy look on translucent sea-glass surfaces, familiar to resale-app users.

Non-goals

- No prices, offers, carts, or listing to a marketplace.
- No schema changes beyond what the panel needs (see §6). No auth or sharing changes.
- No new rounds or decision types. Usage ("Do you use this?") stops being a round.

## 3. Part A — the item panel

**Route.** `/collections/[id]/items/[n]` becomes the only item surface. `/edit` and `/photos`
redirect to it. "Add item" and the pool's "group into an item" both land here.

**Layout (tablet, two columns; phone, stacked).**

- Left: a carousel showing one photo at a time, cover first. Prev/next arrows, dots, keyboard
  arrows, and native swipe. Tap the photo to open the zoom view (pinch and buttons; rotate lives
  here and is saved). Under it a thumbnail strip: tap to jump, drag to reorder, long-press or a
  small "···" for **Make cover** and **Delete**. The last tile is **+ Add photos**, which accepts
  many files at once (the pool's uploader, reused).
- Right: the fields as a listing form, always editable: Name, Brand, Style, Colour, Material,
  Category, Size (height × width × depth with a unit toggle), Weight, Notes, and "Where will it go
  next?" (story). Each field saves on blur with a quiet "Saved" tick; no Edit or Save buttons.
  Empty fields show a soft prompt ("Add a brand") in accent colour, never a count of what is missing.
- Header: name as display type, "#14 · added in June" below. Actions row under the fields:
  **Sort from here** (primary; starts or resumes the sort with this item first), **Share** (only on
  a finalized ranking; otherwise hidden), and an overflow **···** with **Archive** and **Delete**.
  Archive is reversible from the items list "Archived" filter. Delete confirms once, in sober
  language, and is the only red action.
- Removed: the "Edit" button, "Edit details", "Manage photos", the separate delete-photo control on
  the carousel, "View photo" buttons on cards, and the "Remove from collection" wording (it is
  Archive now; the hard delete is Delete).

**Items list.** Grid of cards (2 columns phone, 3 to 4 tablet): cover photo, name, brand, one tier
chip if sorted. A search field and filter pills (All, Archived, and the existing "Waiting for a
name") replace the status filter row. "Deleted" filter goes. Tap a card to open the panel.

## 4. Part B — the sort

Four screens replace eleven.

1. **Start.** Collection home has one primary button, "Start sorting" or "Keep sorting". It opens
   the Sort screen directly. The goal form, scope setting, sort index, and "Set a goal first" go.
   Timer: off by default; a small settings sheet on the Sort screen offers 1, 2, or 5 minutes.
2. **Sort.** One screen, one item at a time. Question: "How do you feel about this one?" with
   Love / Like / Maybe / Onward, and quieter **Not yet** and **Not mine** below. Once two or more
   items are Love or Like, the screen alternates in pairs: "Which would you reach for first?" with
   Tie and Skip. The usage question becomes an **"In your life"** toggle on the item card during
   either question, not a round. One **Back** (undo last decision), one **Pause** (returns home;
   progress is kept). A thin progress line ("12 of 40 placed") at the top, no step dots.
   Round recaps ("Here's what moved") go; the ranking is one tap away instead.
3. **Ranking.** `/collections/[id]/results` is the live standing: "What you love most" at the top,
   then the ordered list with photos, then an Onward row, then a collapsed "Set aside" row with
   **Bring back**. Drag or up/down to adjust directly; no "Adjust results" mode, no draft objects
   created by viewing. Reachable from home and from the Sort screen at any time.
4. **Save and share.** One button on the Ranking screen, **Save and share**: name it (prefilled
   with the collection name and date), freeze it, get the link. "Make a revision" reopens the same
   ranking for adjusting instead of creating a second draft. Set-aside session, "Take a break",
   the hub, the sort index, round recaps, and `/sort/set-aside` all go.

Vocabulary is fixed: tiers Love / Like / Maybe / Onward; escapes Not yet / Not mine; "Set aside"
only ever means an item set aside with Not mine.

## 5. Part C — the look (Frosted shelf)

- Keep the Sea Glass hues and the Playfair / Inter pairing. Replace opaque surfaces with
  **frosted glass**: white at about 50% over a tinted wash, backdrop blur, white rim, soft cool
  shadow. Ground: a pale sea-glass gradient with two soft colour washes (aqua, mint) rather than a
  flat tint.
- Shapes: 20px card radius, pill buttons and filter chips, 44px targets. Accent: a brighter teal
  than today's so it reads on frost; AA re-verified in both themes.
- Dark theme: the same structure in **Tide pool** colours (teal glass at ~40%, mint accent on dark
  text), which the brainstorm screen also shows.
- Lists: search field plus filter pills at the top; cards in a grid; overflow menus for rare
  actions; a fixed bottom action bar on phone for the one primary action.
- Collections list becomes a grid of cover-photo cards. Collection home becomes the items grid
  with "Start sorting" as the single primary action and an "Add photos" pill beside it.
- Reduced motion: blur and transitions degrade to instant; blur is a visual, never a signal.

## 6. Data and API changes (minimal)

- Items: no new columns. Height, width, depth, weight, unit, and story are already stored; the
  panel surfaces them. `status` gains the user-facing **archived** action (an existing value).
- Photos: `sortOrder` is needed for drag-to-reorder. Today order is hero-first then createdAt;
  add an integer `position` to photos with a backfill migration.
- Sessions: scope and goal become fixed defaults server-side; the columns stay, the UI stops
  writing them. Usage answers are written by the "In your life" toggle through the existing
  decision route.
- Results: "Save and share" uses the existing draft → finalize path, but the draft is created at
  save time only. Viewing the ranking reads the live standing and creates nothing.
- Redirects: `/items/[n]/edit` and `/items/[n]/photos` → `/items/[n]`; `/sort`, `/sort/new`,
  `/sort/[s]`, `/sort/[s]/triage|usage|compare` → `/collections/[id]/sort` (the new single Sort
  screen); `/sort/set-aside` and `/results/set-aside` → `/results`.

## 7. Testing

- Unit: field autosave (debounce, failure keeps the edit and shows "Couldn't save"), photo reorder
  position math, the sort screen's question chooser (feelings until two Love/Like exist, then pairs
  interleaved), ranking adjust.
- DB (one real crossing each): photo `position` migration backfill; archive → Archived filter.
- E2E (tablet, plus phone for the panel and sort): add photos → edit fields → archive → bring
  back; start → decide 5 items → ranking → save and share → open link. Replace the removed flows'
  specs rather than keeping them skipped.
- Accessibility: axe scan on the panel, sort, and ranking; contrast test extended for the new
  glass tokens in both themes.

## 8. Delivery

Three PRs, each behind nothing, each with light/dark/phone screenshots:

1. **Item panel** (Part A + the glass tokens and card component from Part C).
2. **Sort** (Part B, reusing the card and glass).
3. **Lists and home** (rest of Part C; collections grid, home-as-grid, bottom bar).

Each PR removes the routes it replaces and adds the redirects. Old specs for those flows are
already archived.

## 9. Open questions for the owner

1. Weight and size: show both, or drop weight? (Default: show both, collapsed under "Size".)
2. Timer: keep at all? (Default: keep, off by default.)
3. "Not mine": keep as a separate escape from "Not yet"? (Default: keep both; they mean different
   things.)
