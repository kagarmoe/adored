// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DISMISS_KEY, dismissWelcome, isWelcomeDismissed } from "./dismissal";
import { installStorage } from "./testStorage";

beforeEach(() => installStorage());
afterEach(() => localStorage.clear());

describe("welcome dismissal helper", () => {
  it("is not dismissed by default", () => {
    expect(isWelcomeDismissed()).toBe(false);
  });

  it("reports dismissed after dismissWelcome sets the flag", () => {
    dismissWelcome();
    expect(localStorage.getItem(DISMISS_KEY)).toBe("1");
    expect(isWelcomeDismissed()).toBe(true);
  });

  it("uses the stable localStorage key", () => {
    expect(DISMISS_KEY).toBe("adored-welcome-dismissed");
  });
});
