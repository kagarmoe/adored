import { describe, expect, it } from "vitest";
import { IN_LIFE_CHIP, RESTING_CHIP } from "./usage-chip-copy";

// The usage chip is a first-order TONE item (spec §2.2): a quiet, count-free
// annotation. This pins the register so a later edit can't slip a number,
// denominator, or urgency word into the two strings.
describe("usage chip copy — register scan", () => {
  const chips = [
    ["IN_LIFE_CHIP", IN_LIFE_CHIP],
    ["RESTING_CHIP", RESTING_CHIP],
  ] as const;

  it.each(chips)("%s carries no digit or percentage", (_name, copy) => {
    expect(copy).not.toMatch(/\d/);
    expect(copy).not.toMatch(/%/);
  });

  it.each(chips)("%s carries no denominator or fraction", (_name, copy) => {
    expect(copy).not.toMatch(/\bof\b/i);
    expect(copy).not.toMatch(/\//);
    expect(copy).not.toMatch(/\bout of\b/i);
  });

  it.each(chips)("%s carries no urgency or shaming word", (_name, copy) => {
    expect(copy).not.toMatch(/\b(now|hurry|too many|left|only|still|never)\b/i);
  });

  it("names the two affirming states", () => {
    expect(IN_LIFE_CHIP).toBe("In your life");
    expect(RESTING_CHIP).toBe("Resting");
  });
});
