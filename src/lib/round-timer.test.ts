import { describe, expect, it } from "vitest";
import { remainingMs, isExpired, fractionElapsed } from "./round-timer";

const START = 1_000_000;

describe("remainingMs", () => {
  it("returns the full box before any time passes", () => {
    expect(remainingMs(START, 60_000, START)).toBe(60_000);
  });

  it("returns the remaining time mid-round", () => {
    expect(remainingMs(START, 60_000, START + 20_000)).toBe(40_000);
  });

  it("returns 0 at exactly the box boundary", () => {
    expect(remainingMs(START, 60_000, START + 60_000)).toBe(0);
  });

  it("clamps to 0 past expiry (never negative)", () => {
    expect(remainingMs(START, 60_000, START + 90_000)).toBe(0);
  });

  it("treats box === 0 as immediately expired (0 remaining)", () => {
    expect(remainingMs(START, 0, START)).toBe(0);
  });

  it("returns null for the no-timer sentinel (boxMs === null)", () => {
    expect(remainingMs(START, null, START + 5_000)).toBeNull();
  });
});

describe("isExpired", () => {
  it("is false before the box elapses", () => {
    expect(isExpired(START, 60_000, START + 59_999)).toBe(false);
  });

  it("is true at exactly the box boundary", () => {
    expect(isExpired(START, 60_000, START + 60_000)).toBe(true);
  });

  it("is true past the boundary", () => {
    expect(isExpired(START, 60_000, START + 120_000)).toBe(true);
  });

  it("is true when box === 0", () => {
    expect(isExpired(START, 0, START)).toBe(true);
  });

  it("is false for the no-timer sentinel (never expires)", () => {
    expect(isExpired(START, null, START + 10_000_000)).toBe(false);
  });
});

describe("fractionElapsed", () => {
  it("is 0 at the start", () => {
    expect(fractionElapsed(START, 60_000, START)).toBe(0);
  });

  it("is 0.5 halfway through", () => {
    expect(fractionElapsed(START, 60_000, START + 30_000)).toBe(0.5);
  });

  it("is 1 at the boundary", () => {
    expect(fractionElapsed(START, 60_000, START + 60_000)).toBe(1);
  });

  it("clamps to 1 past expiry", () => {
    expect(fractionElapsed(START, 60_000, START + 90_000)).toBe(1);
  });

  it("is 1 (fully elapsed) when box === 0", () => {
    expect(fractionElapsed(START, 0, START)).toBe(1);
  });

  it("is 0 for the no-timer sentinel (nothing to fill)", () => {
    expect(fractionElapsed(START, null, START + 5_000)).toBe(0);
  });
});
