# Page responsive layout coverage

- **Date:** 2026-07-14
- **Status:** Draft coverage addendum
- **Scope:** every `src/app/**/page.tsx` route found by `rg --files src/app | rg '/page\.tsx$'`.
- **Authorities:** [`TONE.md`](../../../TONE.md), [`PRODUCT.md`](../../../PRODUCT.md), [`DESIGN.md`](../../../DESIGN.md), plus the route-specific specs linked from the implementation plans.

## Global responsive rules

These rules apply to every rendered page route:

1. Tablet/web remains the primary source layout unless a route-specific spec says otherwise.
2. Phone is a first-class layout, not a squeezed tablet view.
3. The main content flows in one column on phone unless a card grid can keep stable, readable tiles without text crowding.
4. Header actions move below the title or stack beside breadcrumbs only when both remain readable.
5. Primary actions are full-width or visually dominant on phone. Secondary actions stack below or become quiet links.
6. Button text must fit inside the button without wrapping or crowding. If the page context already supplies the object, shorten the phone label. Example: `Begin a collection` on tablet/web becomes `Begin` on phone.
7. Forms use a single column on phone. Submit/cancel rows stack vertically when two buttons would crowd each other.
8. Choice rounds avoid side-by-side compression. If two choices cannot stay comfortably readable, stack them vertically.
9. Phone screenshots for page work must include the route state that carries the longest heading, longest primary CTA, and densest card/list content.

Redirect-only pages do not need an independent phone layout, but the target page does.
Pages that delegate fully to a shared shell are covered by that shell's phone layout contract.

## Route inventory

| Route file | Tablet/web view | Phone layout |
|---|---|---|
| `src/app/page.tsx` | Public entry centered in the viewport with app name, one short line, and sign-in action. Authenticated users redirect to `/collections`. | Keep the same public entry as a narrow single column on `bg-ground`: app name, one short line, then a full-width `Sign in` action. |
| `src/app/login/page.tsx` | Centered auth panel with heading, helper copy, and Google action. | Center one auth panel. Heading and helper copy stack above one full-width Google action. Loading text must fit; shorten to `Opening...` if `Opening Google...` crowds. |
| `src/app/signup/page.tsx` | Redirects to `/login`; `/login` owns the tablet/web view. | Redirects to `/login`; no independent phone layout. |
| `src/app/invitations/[token]/page.tsx` | Invitation card with collection summary and accept/decline actions. | Center one invitation card. Collection summary sits above actions. Stack `Accept`/`Decline` vertically on phone; use `Accept` if `Accept invitation` crowds. Error/loading states use the same centered single-column frame. |
| `src/app/welcome/page.tsx` | Shared `WalkthroughShell`, one centered beat inside a constrained shell. Compare-style beats may use tablet side-by-side cards when labels and images remain readable. | Shared `WalkthroughShell`. One beat per phone screen, one primary action at the bottom of the beat, no side-by-side teaching panels. Long action labels shorten by beat context. |
| `src/app/tutorial/page.tsx` | Dev-only route using the same `WalkthroughShell` as `/welcome`; production 404s. Covered by the `/welcome` tablet/web contract. | Dev-only route using the same `WalkthroughShell` as `/welcome`; production 404s. Covered by the `/welcome` phone contract. |
| `src/app/profile/page.tsx` | AppLayout page with profile form card, theme row, walkthrough row, and account deletion section in the standard content width. | Title, profile form card, theme row, walkthrough row, and account deletion section stack in one column. Rows with trailing controls may become text-above-control blocks. `Save changes` may shorten to `Save` if needed. |
| `src/app/collections/page.tsx` | Header and primary action share the top row; collection cards render as a responsive grid. Empty state uses the full `Begin a collection` action. | Title and copy stack above the primary action. Phone CTA is `Begin`; collection cards render one per row. Empty state uses the same single-column CTA treatment. |
| `src/app/collections/new/page.tsx` | Standard `CollectionForm` in a constrained form column with submit/cancel actions. | One-column `CollectionForm`. Fields are full width. Submit/cancel stack vertically when needed; phone primary may shorten from `Create collection` to `Create`. |
| `src/app/collections/[id]/page.tsx` | Adaptive workspace. Uses the tablet/web wireframes in `2026-06-28-adaptive-collection-workspace-design.md`: pool-first, items-first, empty, owner utilities, and collection-list cue rules. | Adaptive workspace. Uses the paired phone wireframes in `2026-06-28-adaptive-collection-workspace-design.md`: pool-first, items-first, empty, owner utilities, and collection-list cue rules. |
| `src/app/collections/[id]/pool/page.tsx` | Photos workspace with heading/copy, upload affordance, pooled-photo grid, and grouping controls. | Phone order: heading/copy, upload affordance, then pooled-photo grid. Selection/grouping controls stay visible without depending on hover, and any toolbar stacks above the grid. |
| `src/app/collections/[id]/items/page.tsx` | Full items grid with header actions, filters, and responsive card grid. | Header stacks; `Add item` is the primary action, `Add photos` secondary. Filters wrap or stack below the header. Item cards use two columns only when the minimum tile width keeps names and controls readable; otherwise one column. |
| `src/app/collections/[id]/items/new/page.tsx` | Standard `ItemForm` in a constrained form column with submit/cancel actions. | One-column `ItemForm`. Fields are full width. Submit/cancel stack vertically; primary label is `Add item`. |
| `src/app/collections/[id]/items/[itemNumber]/page.tsx` | Item detail may use a tablet/web split between photo carousel and story/details content. | Phone order: item title and quiet edit/name affordance, photo carousel or empty-photo block, story/next-place content, details card, photo-management link. No tablet two-column split. |
| `src/app/collections/[id]/items/[itemNumber]/photos/page.tsx` | Item photo manager with upload card and gallery card in the standard content width. | Phone order: title, upload card, gallery card. Gallery tiles keep controls reachable by tap; move/rotate/delete actions never rely on hover. |
| `src/app/collections/[id]/items/[itemNumber]/edit/page.tsx` | Standard `ItemForm` edit view in a constrained form column. | One-column `ItemForm` in edit mode. Submit/cancel stack vertically when needed; primary label may shorten from `Save changes` to `Save`. |
| `src/app/collections/[id]/members/page.tsx` | People page with invite form and member list in the standard AppLayout width. | Heading/copy first, invite form full width, member list below as stacked rows. Owner/member badges and remove controls stay within each row without horizontal scroll. |
| `src/app/collections/[id]/results/page.tsx` | Live Standing/Decide surface with header actions and shared `RankedResults` composition. | Header and actions stack. `Put things in order` and `Finalize` become full-width or vertically stacked. Ranking and Onward sections follow the shared `RankedResults` phone grid rules. |
| `src/app/collections/[id]/results/[resultNumber]/page.tsx` | Result detail with header badge/title, `Finalize` action when applicable, rerank panel, ranked result, and sharing surface. | Header badge/title and `Finalize` action stack. Rerank panel is a vertical list with keyboard/tap controls exposed; the ranked result composition follows below; sharing sits after the result content. |
| `src/app/collections/[id]/results/[resultNumber]/finalize/page.tsx` | Finalize form in one constrained card with text field and primary action. | One card, one text field, one full-width primary action. The button remains `Finalize`; loading text may shorten if needed. |
| `src/app/collections/[id]/edit/page.tsx` | Standard `CollectionForm` edit view in a constrained form column. | One-column `CollectionForm` in edit mode. Submit/cancel stack vertically; destructive collection actions, if present, sit after the safe form actions. |
| `src/app/collections/[id]/sort/page.tsx` | Sorting sessions hub with header action, current-session card, and past-session list/cards. | Header stacks with `New session` below it. Current-session card shows `Resume` then `Details` as stacked actions. Past sessions render as one-column cards/list rows. |
| `src/app/collections/[id]/sort/new/page.tsx` | New sorting session setup form with round-length controls and primary start action. | Single-column setup form. Round-length controls wrap without crowding; primary action may shorten to `Begin` or `Start` when the context already says sorting session. |
| `src/app/collections/[id]/sort/[sessionNumber]/page.tsx` | Session hub with recommended round card, available round cards, and results/finish entry. | Recommended round card first, then available round cards in one column, then results/finish entry. Card CTAs stay short (`Begin`, `Open`, `Resume`). |
| `src/app/collections/[id]/sort/[sessionNumber]/triage/page.tsx` | Triage round with one item and tier controls; tablet can use a stable grid when labels fit. | One item dominates the screen. Tier buttons use a stable 2x2 grid only when labels fit; escape actions form a separate quiet row below. `Take a break` remains reachable in chrome. |
| `src/app/collections/[id]/sort/[sessionNumber]/usage/page.tsx` | Usage round with one item, usage controls, pass action, and round chrome. | One item dominates the screen. `Yes, I use it`, `Not these days`, and `Skip for now` stack or form a 2-plus-1 layout only if every label fits. Quick pace and timer controls never overlap the item content. |
| `src/app/collections/[id]/sort/[sessionNumber]/compare/page.tsx` | Compare round can use side-by-side cards on tablet/web with tie/skip below. | Question and two choices stack vertically on phone unless both cards stay readable side by side. Tie/skip controls sit below the choices as explicit tap targets. |
| `src/app/collections/[id]/sort/set-aside/page.tsx` | Set-aside list with item rows/cards and `Bring back` controls. | One-column list of items with `Bring back` controls contained in each row/card. Empty state uses a single quiet return action. |
| `src/app/shared-results/[token]/page.tsx` | Public read-only result with header/badge and ranked content in a share-friendly width. | Header/badge stack above result content. Item cards use two columns only when names and tier badges fit; otherwise one column. No authenticated chrome is assumed. |

## Verification expectation

For any PR that changes a `page.tsx` route or the shared component that owns its layout:

- Confirm the route is represented in the inventory above.
- Capture or inspect the phone state that has the longest actionable label.
- If a phone button label does not fit, shorten the visible label and keep the accessible name clear from context or `aria-label`.
- If a route delegates to a shared shell, verify the shell once and name the dependent routes in the PR notes.
