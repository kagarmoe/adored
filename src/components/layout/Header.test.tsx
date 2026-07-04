// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Header } from "./Header";

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: { user: { name: "Tessa", email: "a@b.c" } } }),
  signOut: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/theme/ThemeToggle", () => ({ ThemeToggle: () => null }));

it("links the user's name to the profile page", () => {
  render(<Header />);
  const link = screen.getByRole("link", { name: /tessa/i });
  expect(link).toHaveAttribute("href", "/profile");
});
