// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, resultRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  resultRepo: { findByCollection: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/SortResultRepository", () => ({ SortResultRepository: vi.fn(function () { return resultRepo; }) }));

import ResultsPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue({ id: "coll_01ABC", slug: "summer-bags", name: "Summer Bags" });
  resultRepo.findByCollection.mockResolvedValue([
    { id: "res_zzz", number: 2, name: "Spring edit", status: "finalized", createdAt: new Date("2026-01-02") },
  ]);
});

describe("ResultsPage links + label", () => {
  it("links by number and labels by number (never the ULID)", async () => {
    const ui = await ResultsPage({ params: { id: "summer-bags" } });
    render(ui);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/collections/summer-bags/results/2");
    expect(screen.getByText("Result #2")).toBeInTheDocument();
    expect(link.getAttribute("href")).not.toContain("res_zzz");
  });
});
