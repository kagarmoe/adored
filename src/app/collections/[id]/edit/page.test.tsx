// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockGetSession, mockRequireAccess } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));
vi.mock("@/lib/collection-access", () => ({ requireCollectionOwnerPage: mockRequireAccess }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/features/collections/CollectionForm", () => ({ CollectionForm: () => <div>form</div> }));
vi.mock("@/features/collections/DeleteCollectionSection", () => ({
  DeleteCollectionSection: () => <div data-testid="delete-collection-section" />,
}));

import EditCollectionPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
});

describe("EditCollectionPage — owner-only gate (requireCollectionOwnerPage)", () => {
  it("renders the edit form and delete section for the owner", async () => {
    mockRequireAccess.mockResolvedValue({ id: "c1", slug: "s", name: "C", ownerId: "u1" });
    render(await EditCollectionPage({ params: { id: "s" } }));
    expect(screen.getByTestId("delete-collection-section")).toBeInTheDocument();
  });

  it("redirects a non-owner (curator) before the page renders", async () => {
    // requireCollectionOwnerPage redirects curators — simulate that redirect throw.
    mockRequireAccess.mockImplementation(() => {
      throw new Error("REDIRECT");
    });
    await expect(EditCollectionPage({ params: { id: "s" } })).rejects.toThrow("REDIRECT");
  });
});
