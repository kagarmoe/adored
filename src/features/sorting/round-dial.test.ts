import { describe, it, expect } from "vitest";
import { angleToBox, boxToAngle, pointToAngle, stepBox } from "./round-dial";

describe("round-dial math", () => {
  it("maps angles to 30s steps (36° each), nearest-step rounding", () => {
    expect(angleToBox(36)).toBe(30);
    expect(angleToBox(50)).toBe(30); // 50/36 → 1.39 → step 1
    expect(angleToBox(55)).toBe(60); // → 1.53 → step 2
    expect(angleToBox(180)).toBe(150);
    expect(angleToBox(360 - 1)).toBe(300); // 359° never wraps to none
  });
  it("the first step-width below 30s is the no-clock zone", () => {
    expect(angleToBox(0)).toBe("none");
    expect(angleToBox(17)).toBe("none");
    expect(angleToBox(18)).toBe(30);
  });
  it("boxToAngle inverts the steps", () => {
    expect(boxToAngle(30)).toBe(36);
    expect(boxToAngle(300)).toBe(360);
    expect(boxToAngle("none")).toBe(0);
  });
  it("pointToAngle: top=0, right=90, bottom=180, left=270", () => {
    expect(pointToAngle(100, 100, 100, 0)).toBe(0);
    expect(pointToAngle(100, 100, 200, 100)).toBe(90);
    expect(pointToAngle(100, 100, 100, 200)).toBe(180);
    expect(pointToAngle(100, 100, 0, 100)).toBe(270);
  });
  it("stepBox walks the steps and through the none boundary", () => {
    expect(stepBox(60, -1)).toBe(30);
    expect(stepBox(30, -1)).toBe("none");
    expect(stepBox("none", 1)).toBe(30);
    expect(stepBox(300, 1)).toBe(300);
    expect(stepBox("none", -1)).toBe("none");
  });
});
