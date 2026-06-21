// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetSession, mockRequireAccess, redirectMock, resultRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  redirectMock: vi.fn(() => { throw new Error("REDIRECT"); }),
  resultRepo: { findByCollectionAndNumber: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/SortResultRepository", () => ({ SortResultRepository: vi.fn(function () { return resultRepo; }) }));
vi.mock("@/features/results/FinalizeResultForm", () => ({ FinalizeResultForm: (props: any) => <div data-testid="form" data-resultid={props.resultId} data-resultnumber={props.resultNumber} /> }));

import FinalizePage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue({ id: "coll_REAL", slug: "summer-bags", name: "S" });
});

describe("FinalizePage resolution + guard", () => {
  it("passes the result ULID + number to the form on the happy path", async () => {
    resultRepo.findByCollectionAndNumber.mockResolvedValue({ id: "res_1", collectionId: "coll_REAL", number: 2, curatorId: "u1", name: "R" });
    const { render } = await import("@testing-library/react");
    const ui = await FinalizePage({ params: { id: "summer-bags", resultNumber: "2" } });
    render(ui);
    const { screen } = await import("@testing-library/react");
    expect(screen.getByTestId("form").getAttribute("data-resultid")).toBe("res_1");
    expect(screen.getByTestId("form").getAttribute("data-resultnumber")).toBe("2");
  });
  it("redirects when the curator is not the requester (guard survives)", async () => {
    resultRepo.findByCollectionAndNumber.mockResolvedValue({ id: "res_1", collectionId: "coll_REAL", number: 2, curatorId: "someone_else", name: "R" });
    await expect(FinalizePage({ params: { id: "summer-bags", resultNumber: "2" } })).rejects.toThrow("REDIRECT");
  });
  it("redirects on a non-numeric segment without hitting the repo", async () => {
    await expect(FinalizePage({ params: { id: "summer-bags", resultNumber: "x" } })).rejects.toThrow("REDIRECT");
    expect(resultRepo.findByCollectionAndNumber).not.toHaveBeenCalled();
  });
});
