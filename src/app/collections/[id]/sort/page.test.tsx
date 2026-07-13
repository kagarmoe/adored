// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, sessionRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  sessionRepo: { findByCollectionAndCurator: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
// ResumeControl (rendered for a paused current session) calls useRouter.
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({ SessionRepository: vi.fn(function () { return sessionRepo; }) }));

import SortPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue({ id: "coll_01ABC", slug: "summer-bags", name: "Summer Bags" });
  sessionRepo.findByCollectionAndCurator.mockResolvedValue([
    { id: "sess_zzz", number: 3, curatorId: "u1", goal: "Discover", status: "completed", createdAt: new Date("2026-01-03") },
  ]);
});

describe("SortPage session links", () => {
  it("links sessions by number (never the ULID)", async () => {
    const ui = await SortPage({ params: Promise.resolve({ id: "summer-bags" }) });
    render(ui);
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/collections/summer-bags/sort/3");
    expect(links.some((h) => h?.includes("sess_zzz"))).toBe(false);
    // purses-t9l: the list is scoped to THIS user's sessions (collection.id + the user id).
    expect(sessionRepo.findByCollectionAndCurator).toHaveBeenCalledWith("coll_01ABC", "u1");
  });

  it("active-session Resume/Details links use the session number, not the ULID", async () => {
    sessionRepo.findByCollectionAndCurator.mockResolvedValue([
      { id: "sess_active", number: 4, curatorId: "u1", goal: "Discover", status: "active", createdAt: new Date("2026-01-04") },
    ]);
    const ui = await SortPage({ params: Promise.resolve({ id: "summer-bags" }) });
    render(ui);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.filter((h) => h === "/collections/summer-bags/sort/4").length).toBeGreaterThanOrEqual(1);
    expect(hrefs.every((h) => !h.includes("sess_active"))).toBe(true);
  });

  it("a paused current session shows a calm 'safe' card with a Resume control", async () => {
    sessionRepo.findByCollectionAndCurator.mockResolvedValue([
      { id: "sess_paused", number: 5, curatorId: "u1", goal: "Discover", status: "paused", createdAt: new Date("2026-01-05") },
    ]);
    const ui = await SortPage({ params: Promise.resolve({ id: "summer-bags" }) });
    render(ui);
    expect(screen.getByText(/your sort is safe — pick up where you left off/i)).toBeInTheDocument();
    // Resume is a button (ResumeControl), not a link — it PATCHes status:active then navigates.
    expect(screen.getByRole("button", { name: /resume/i })).toBeInTheDocument();
  });

  // purses-4bhh: a 2nd session while one is open 500s on sessions_active_unique.
  it("gates New Session / Create Session while a current (active or paused) session exists", async () => {
    sessionRepo.findByCollectionAndCurator.mockResolvedValue([
      { id: "sess_paused", number: 5, curatorId: "u1", goal: "Discover", status: "paused", createdAt: new Date("2026-01-05") },
    ]);
    const ui = await SortPage({ params: Promise.resolve({ id: "summer-bags" }) });
    render(ui);
    const newSessionHrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href") ?? "")
      .filter((h) => h.endsWith("/sort/new"));
    expect(newSessionHrefs).toHaveLength(0);
    expect(screen.queryByRole("link", { name: /new session/i })).not.toBeInTheDocument();
  });

  it("offers New Session when NO current session exists (only completed history)", async () => {
    // default mock: a single completed session — nothing open.
    const ui = await SortPage({ params: Promise.resolve({ id: "summer-bags" }) });
    render(ui);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(hrefs).toContain("/collections/summer-bags/sort/new");
  });
});
