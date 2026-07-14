// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecommendedRound } from "./RecommendedRound";
import { markUsageRoundRan } from "@/lib/usage-round-prefs";
import type { NextRound } from "@/lib/next-round";

const primaryRound: NextRound = {
  kind: "usage",
  label: "Do you use this?",
  description: "An easy pass — just whether each piece is in your life right now.",
  cta: "Begin",
};
const demotedRound: NextRound = {
  kind: "compare",
  label: "Compare",
  description: "Put two pieces side by side and choose what rises.",
  cta: "Compare",
};

const primary = { round: primaryRound, href: "/collections/c/sort/1/usage" };
const whenUsageDemoted = { round: demotedRound, href: "/collections/c/sort/1/compare" };

const CURATOR = "curator-1";
const SESSION = "sess-1";

// jsdom in this setup does not expose a working localStorage on file:// URLs, so
// install a minimal Map-backed Storage (mirrors usage-round-prefs.test.ts).
function installStorage(): void {
  const map = new Map<string, string>();
  const store: Storage = {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    key: (i) => Array.from(map.keys())[i] ?? null,
  };
  Object.defineProperty(window, "localStorage", { value: store, configurable: true });
}

beforeEach(() => {
  installStorage();
});

describe("RecommendedRound — device-local demotion swap", () => {
  it("renders the primary (usage) card when the device has no round-ran flag", () => {
    render(
      <RecommendedRound
        primary={primary}
        whenUsageDemoted={whenUsageDemoted}
        curatorId={CURATOR}
        sessionId={SESSION}
      />,
    );
    expect(screen.getByText("Do you use this?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Begin" })).toHaveAttribute(
      "href",
      "/collections/c/sort/1/usage",
    );
    expect(screen.queryByText("Compare")).not.toBeInTheDocument();
  });

  it("swaps to the demoted card after mount when THIS (curator, session) ran a usage round", () => {
    markUsageRoundRan(CURATOR, SESSION);
    render(
      <RecommendedRound
        primary={primary}
        whenUsageDemoted={whenUsageDemoted}
        curatorId={CURATOR}
        sessionId={SESSION}
      />,
    );
    // After the mount effect reads the device flag, the same slot shows the demoted card.
    expect(screen.getAllByText("Compare").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Compare" })).toHaveAttribute(
      "href",
      "/collections/c/sort/1/compare",
    );
    expect(screen.queryByText("Do you use this?")).not.toBeInTheDocument();
  });

  it("keeps the primary when only a DIFFERENT curator ran a usage round (isolation)", () => {
    markUsageRoundRan("other-curator", SESSION);
    render(
      <RecommendedRound
        primary={primary}
        whenUsageDemoted={whenUsageDemoted}
        curatorId={CURATOR}
        sessionId={SESSION}
      />,
    );
    expect(screen.getByText("Do you use this?")).toBeInTheDocument();
    expect(screen.queryByText("Compare")).not.toBeInTheDocument();
  });

  it("keeps the primary when a DIFFERENT session ran a usage round (isolation)", () => {
    markUsageRoundRan(CURATOR, "other-session");
    render(
      <RecommendedRound
        primary={primary}
        whenUsageDemoted={whenUsageDemoted}
        curatorId={CURATOR}
        sessionId={SESSION}
      />,
    );
    expect(screen.getByText("Do you use this?")).toBeInTheDocument();
    expect(screen.queryByText("Compare")).not.toBeInTheDocument();
  });

  it("swaps in the same slot with NO transition/animation classes on the swap container", () => {
    markUsageRoundRan(CURATOR, SESSION);
    const { container } = render(
      <RecommendedRound
        primary={primary}
        whenUsageDemoted={whenUsageDemoted}
        curatorId={CURATOR}
        sessionId={SESSION}
      />,
    );
    // The swap is a plain re-render of the same presentational card container —
    // no fade/slide. A regression that adds motion classes fails here (§7.2).
    const swapContainer = container.firstElementChild as HTMLElement;
    expect(swapContainer).not.toBeNull();
    expect(swapContainer.className).not.toMatch(/transition|animate|duration|fade|slide/);
  });

  it("reserves a min-height so the primary→demoted swap never reflows the hub (I1)", () => {
    // Spec §3.8: primary and demoted copy must render at the same size (zero layout
    // shift on the post-hydration swap). The card carries a min-height reservation
    // sized for the tallest round description at hub widths.
    const { container } = render(
      <RecommendedRound
        primary={primary}
        whenUsageDemoted={whenUsageDemoted}
        curatorId={CURATOR}
        sessionId={SESSION}
      />,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.className).toMatch(/min-h-/);
  });

  it("renders the primary unchanged when there is no whenUsageDemoted alternative", () => {
    const compareOnly = { round: demotedRound, href: "/collections/c/sort/1/compare" };
    // Even with a stray flag set, a primary that is not usage has no demoted twin to swap to.
    markUsageRoundRan(CURATOR, SESSION);
    render(
      <RecommendedRound primary={compareOnly} curatorId={CURATOR} sessionId={SESSION} />,
    );
    expect(screen.getAllByText("Compare").length).toBeGreaterThan(0);
  });
});
