// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AppLayout } from "./AppLayout";
import { ActionBar } from "./ActionBar";

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: { user: { name: "Tessa", email: "a@b.c" } } }),
  signOut: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/theme/ThemeToggle", () => ({ ThemeToggle: () => null }));

// DOM-node tripwire: the footer must recede to the ground in dark (not sit as a
// `bg-surface` teal slab), kept as a quiet divider by its top hairline. Proves
// the class is on the real <footer>, NOT that the cascade wins — the dark
// screenshot proves that (spec Risks).
it("dark footer recedes to ground with a hairline divider, not a surface slab", () => {
  const { container } = render(
    <AppLayout>
      <p>content</p>
    </AppLayout>,
  );
  const footer = container.querySelector("footer");
  expect(footer).not.toBeNull();
  expect(footer?.className).toContain("dark:bg-ground");
  expect(footer?.className).toContain("border-t");
  expect(footer?.className).toContain("border-hairline");
});

it("stacks page chrome actions on phone and restores the row on tablet", () => {
  const { container } = render(
    <AppLayout
      breadcrumbs={[{ label: "Collections", href: "/collections" }, { label: "Round" }]}
      actions={<button type="button">Take a break</button>}
    >
      <p>content</p>
    </AppLayout>,
  );

  const actionWrap = container.querySelector("main div.mb-6");
  expect(actionWrap).not.toBeNull();
  expect(actionWrap?.className).toContain("w-full");
  expect(actionWrap?.className).toContain("sm:w-auto");
  expect(actionWrap?.className).toContain("sm:justify-end");
});

it("reserveActionBar pads for the bar, released where the bar goes static", () => {
  const { container } = render(
    <AppLayout reserveActionBar>
      <p>content</p>
    </AppLayout>,
  );
  expect((container.firstChild as HTMLElement).className).toContain(
    "pb-36 md:pb-0 [@media(max-height:500px)]:pb-0",
  );
});

// A fixed bar must not inherit its stack's space-y margin, or it floats above the
// viewport bottom on phones (the e2e phone-bar test measures the real geometry).
it("the fixed phone action bar drops any flow margin below md", () => {
  const { container } = render(
    <ActionBar label="Next step">
      <button>Go</button>
    </ActionBar>,
  );
  expect(container.querySelector("[data-action-bar]")!.className).toContain("max-md:mb-0");
});
