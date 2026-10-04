// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AppLayout } from "./AppLayout";

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: { user: { name: "Tessa", email: "a@b.c" } } }),
  signOut: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/theme/ThemeToggle", () => ({ ThemeToggle: () => null }));

// DOM-node tripwire: the footer sits on the ground wash with no fill of its own (not a
// `bg-surface` slab in either theme), kept as a quiet divider by its top hairline.
it("footer recedes to the wash with a hairline divider, not a surface slab", () => {
  const { container } = render(
    <AppLayout>
      <p>content</p>
    </AppLayout>,
  );
  const footer = container.querySelector("footer");
  expect(footer).not.toBeNull();
  expect(footer?.className).not.toMatch(/(^|\s)(dark:)?bg-/);
  expect(footer?.className).toContain("border-t");
  expect(footer?.className).toContain("border-hairline");
});

// The Frosted shelf wash lives on <body>; an opaque fill on the app shell hides it
// (the bug that shipped with PR 1: every screen read as flat pale aqua).
it("app shell paints no opaque ground over the body wash", () => {
  const { container } = render(
    <AppLayout>
      <p>content</p>
    </AppLayout>,
  );
  const shell = container.querySelector("[data-app-shell]");
  expect(shell).not.toBeNull();
  expect(shell?.className).not.toMatch(/(^|\s)bg-/);
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
