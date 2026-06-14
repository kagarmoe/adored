import { describe, it, expect } from "vitest";
import { isRequestAuthorized } from "./middleware-auth";

describe("middleware authorization predicate", () => {
  it("allows the Blob upload-completion callback through without a session", () => {
    // Vercel Blob's onUploadCompleted is a server-to-server POST with no
    // user session; the route verifies the Blob-signed payload itself.
    expect(
      isRequestAuthorized("/api/collections/col_123/pool/upload", false),
    ).toBe(true);
  });

  it("still requires a session for other protected routes", () => {
    expect(isRequestAuthorized("/api/collections/col_123/items", false)).toBe(false);
    expect(isRequestAuthorized("/collections/col_123/pool", false)).toBe(false);
    // The pool photo FILE route is browser-loaded (has cookies) — stays protected.
    expect(
      isRequestAuthorized("/api/collections/col_123/pool/photos/photo_1/file", false),
    ).toBe(false);
  });

  it("allows authenticated users through normally", () => {
    expect(isRequestAuthorized("/collections/col_123/pool", true)).toBe(true);
    expect(isRequestAuthorized("/api/collections/col_123/items", true)).toBe(true);
  });

  it("does not allow a forged path that merely contains the upload segment", () => {
    expect(
      isRequestAuthorized("/api/collections/col_123/pool/upload/extra", false),
    ).toBe(false);
    expect(
      isRequestAuthorized("/evil/api/collections/col_123/pool/upload", false),
    ).toBe(false);
  });
});
