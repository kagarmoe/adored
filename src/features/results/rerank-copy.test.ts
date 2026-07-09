import { describe, expect, it } from "vitest";
import {
  PUT_IN_ORDER,
  DONE_ARRANGING,
  BACK_TO_COMPUTED,
  MAKE_A_REVISION,
  DRAFT_SHAPE_FRAMING,
  STANDING_CURRENT_FRAMING,
  movedAnnouncement,
  moveUpLabel,
  moveDownLabel,
} from "./rerank-copy";

// Epic S S3b, spec §6.7: every re-rank string is a first-order TONE item.
// Register scan — no digits (count-free), no urgency, no shaming/letting-go
// framing. The announce string is exempt from the digit rule (position N of M is
// an AT necessity, not a shaming count on the visible surface).
describe("re-rank copy register (TONE)", () => {
  const visibleStrings = [
    PUT_IN_ORDER,
    DONE_ARRANGING,
    BACK_TO_COMPUTED,
    MAKE_A_REVISION,
    DRAFT_SHAPE_FRAMING,
    STANDING_CURRENT_FRAMING,
    moveUpLabel("Blue tote"),
    moveDownLabel("Blue tote"),
  ];

  it("carries no digits or denominators on any visible string", () => {
    for (const s of visibleStrings) {
      expect(s).not.toMatch(/[0-9]|%/);
    }
  });

  it("carries no urgency / shaming / letting-go framing", () => {
    const forbidden =
      /\b(now|hurry|must|too many|discard|delete|release|get rid|throw|declutter)\b/i;
    for (const s of visibleStrings) {
      expect(s).not.toMatch(forbidden);
    }
  });

  it("frames the draft as shapeable and Standing as the current picture (the §4.4 bridge)", () => {
    expect(DRAFT_SHAPE_FRAMING).toMatch(/shape/i);
    expect(STANDING_CURRENT_FRAMING).toMatch(/current picture/i);
  });

  it("announces a move with a 1-based position of a total", () => {
    expect(movedAnnouncement("Blue tote", 2, 5)).toBe("Moved Blue tote to position 2 of 5.");
  });
});
