import { describe, it, expect } from "vitest";
import {
  appendStoryDictation,
  STORY_MAX_LENGTH,
  STORY_LIMIT_MESSAGE,
} from "./voice-dictation";

describe("appendStoryDictation", () => {
  it("appends to an empty story with no leading separator", () => {
    expect(appendStoryDictation("", "Off to my niece.")).toEqual({
      text: "Off to my niece.",
      clamped: false,
    });
  });

  it("joins an existing story and the transcript with a single separating space", () => {
    const r = appendStoryDictation("It was my mother's.", "She loved it too.");
    expect(r.text).toBe("It was my mother's. She loved it too.");
    expect(r.clamped).toBe(false);
  });

  it("appends verbatim — it does not trim or rewrite the transcript", () => {
    // Internal spacing is the speaker's; only the join gets one space.
    expect(appendStoryDictation("A", "b c  d").text).toBe("A b c  d");
  });

  it("no-ops on an empty transcript (a silent session changes nothing)", () => {
    expect(appendStoryDictation("Kept as-is.", "")).toEqual({
      text: "Kept as-is.",
      clamped: false,
    });
  });

  it("does not clamp when the combined length lands exactly on the limit", () => {
    const existing = "a".repeat(STORY_MAX_LENGTH - 10); // 1990
    const transcript = "b".repeat(9); // 1990 + 1 separator + 9 = 2000
    const r = appendStoryDictation(existing, transcript);
    expect(r.text.length).toBe(STORY_MAX_LENGTH);
    expect(r.clamped).toBe(false);
  });

  it("clamps to exactly the limit on overflow, keeping the existing prefix", () => {
    const existing = "a".repeat(STORY_MAX_LENGTH - 10); // 1990
    const transcript = "b".repeat(20); // 1990 + 1 + 20 = 2011
    const r = appendStoryDictation(existing, transcript);
    expect(r.text.length).toBe(STORY_MAX_LENGTH);
    expect(r.clamped).toBe(true);
    // The existing story is never trimmed; only the transcript tail is dropped.
    expect(r.text).toBe(`${existing} ${"b".repeat(9)}`);
  });

  it("honors a caller-supplied max", () => {
    const r = appendStoryDictation("hello", "world", 8); // "hello world" → 8
    expect(r.text).toBe("hello wo");
    expect(r.clamped).toBe(true);
  });

  it("exposes the person-side limit copy and the 2000-char cap", () => {
    expect(STORY_LIMIT_MESSAGE).toBe(
      "That's all the room this story needs for now.",
    );
    expect(STORY_MAX_LENGTH).toBe(2000);
  });
});
