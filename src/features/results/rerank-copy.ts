// Epic S S3b (spec §4.3/§4.4/§6): the manual re-rank surface's copy. All strings
// are first-order TONE items — gentle, person-side, no counts/urgency/shaming, no
// letting-go framing. Kept in one dependency-free module so the render, the a11y
// announce, and the register scan assert against the SAME strings.

/** Turns the ranked list into a drag-to-reorder list (PRODUCT.md sanctions drag
 *  for reordering; no swiping). */
export const PUT_IN_ORDER = "Put in order by hand";

/** Leaves reorder mode. */
export const DONE_ARRANGING = "Done";

/** Resets the manual overlay — NULLs manualRank for every item. Person-side copy
 *  ("suggested", not the machinery word "computed"). */
export const BACK_TO_COMPUTED = "Back to the suggested order";

/** The finalized keepsake is immutable; reorder is a draft activity, so a
 *  finalized result offers the existing supersede flow instead. */
export const MAKE_A_REVISION = "Make a revision";

/** §4.4 framing bridge — the DRAFT result is the shapeable keepsake. */
export const DRAFT_SHAPE_FRAMING =
  "This is the keepsake you can shape — arrange it however feels right.";

/** §4.4 framing bridge — live Standing is the always-current picture (so a
 *  hand-order not sticking in live Standing never reads as "my order reverted"). */
export const STANDING_CURRENT_FRAMING =
  "This is the current picture — it keeps up as you sort.";

/** The move-up / move-down control labels (a name, never a bare glyph, for AT). */
export const moveUpLabel = (name: string) => `Move ${name} up`;
export const moveDownLabel = (name: string) => `Move ${name} down`;

/** Grab handle label for the drag affordance (AT-visible name). */
export const dragHandleLabel = (name: string) => `Reorder ${name}`;

/** The role="status" announcement after a move (§4.3). Position is 1-based. */
export const movedAnnouncement = (name: string, position: number, total: number) =>
  `Moved ${name} to position ${position} of ${total}.`;

/** 9v1f.1 cross-tier: the boundary between the loved ranking and the Onward group
 *  in the hand-order list. A real (AT-perceivable) divider, not a hairline. */
export const HANDORDER_ONWARD_LABEL = "Onward";
export const HANDORDER_ONWARD_CAPTION = "Ready to move on — arrange these too.";

/** 9v1f.1 cross-tier: each row's zone, exposed to AT via a visually-hidden span so
 *  group membership is perceivable on static navigation, not just on a move. */
export const ZONE_LOVED_LABEL = "In your ranking";
export const ZONE_ONWARD_LABEL = "In Onward";

/** 9v1f.1 cross-tier: announcements that name the DESTINATION section on a cross
 *  (neutral — no demotion framing; position is the AT necessity). */
export const movedToOnwardAnnouncement = (name: string, position: number, total: number) =>
  `Moved ${name} to Onward, position ${position} of ${total}.`;
export const movedToRankingAnnouncement = (name: string, position: number, total: number) =>
  `Moved ${name} into your ranking, position ${position} of ${total}.`;
