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
