// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  DISMISS_KEY,
  dismissWelcome,
  isDismissedInCookieString,
  isWelcomeDismissed,
} from "./dismissal";

// jsdom exposes a writable document.cookie; clear it between tests.
afterEach(() => {
  document.cookie = `${DISMISS_KEY}=; path=/; max-age=0`;
});

describe("welcome dismissal cookie helper", () => {
  it("is not dismissed by default", () => {
    expect(isWelcomeDismissed()).toBe(false);
  });

  it("reports dismissed after dismissWelcome writes the cookie", () => {
    dismissWelcome();
    expect(document.cookie).toContain(`${DISMISS_KEY}=1`);
    expect(isWelcomeDismissed()).toBe(true);
  });

  it("uses the stable cookie key", () => {
    expect(DISMISS_KEY).toBe("adored-welcome-dismissed");
  });

  it("parses a raw cookie header (the shared server/client path)", () => {
    expect(isDismissedInCookieString("foo=bar; adored-welcome-dismissed=1; x=y")).toBe(true);
    expect(isDismissedInCookieString("foo=bar; x=y")).toBe(false);
    expect(isDismissedInCookieString("")).toBe(false);
  });
});
