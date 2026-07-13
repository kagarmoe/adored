import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression test for purses-2eoy: this route is PUBLIC (unauthenticated callers
// reach it), and its catch block used to echo the raw error.message — leaking
// driver text / constraint names / values to a stranger.
const { mockGetDb, mockViewSharedResult } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockViewSharedResult: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/api/shares", () => ({
  ShareController: { fromDb: () => ({ viewSharedResult: mockViewSharedResult }) },
}));

import { GET } from "./route";

const INTERNAL = 'relation "sort_result_shares" does not exist';

describe("GET /api/shared-results/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue({ db: "fake" });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("does not leak the underlying error message to the public caller", async () => {
    mockViewSharedResult.mockRejectedValue(new Error(INTERNAL));

    const res = await GET({} as never, { params: Promise.resolve({ token: "tok" }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(JSON.stringify(body)).not.toContain("sort_result_shares");
    expect(body.error).toBe("That shared result isn't available.");
  });
});
