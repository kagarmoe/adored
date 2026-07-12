import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "./pg-conflict";

// The shape drizzle 0.45 actually throws: a generic Error whose message names the
// QUERY, not the constraint, with the real PostgresError demoted to `.cause`.
// Reading `error.code` on this returns undefined — which is the regression.
const wrapped = Object.assign(new Error("Failed query: insert into \"sessions\" ..."), {
  cause: Object.assign(new Error('duplicate key value violates unique constraint "sessions_active_unique"'), {
    code: "23505",
    constraint_name: "sessions_active_unique",
  }),
});

describe("isUniqueViolation", () => {
  it("sees through drizzle's wrapper to the PostgresError in .cause", () => {
    expect(isUniqueViolation(wrapped, "sessions_active_unique")).toBe(true);
  });

  it("does not fire for a DIFFERENT unique index on the same table", () => {
    // The slot conflict must not be mistaken for the MAX+1 number race: one is a
    // gentle 409, the other is retried. Confusing them either retries forever or
    // 409s a recoverable race.
    expect(isUniqueViolation(wrapped, "sessions_collection_number_unique")).toBe(false);
  });

  it("still matches a BARE PostgresError (unwrapped by a future driver)", () => {
    const bare = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint_name: "collections_slug_unique",
    });
    expect(isUniqueViolation(bare, "collections_slug_unique")).toBe(true);
  });

  it("ignores a non-unique-violation error", () => {
    const fk = Object.assign(new Error("fk"), { code: "23503", constraint_name: "x" });
    expect(isUniqueViolation(fk, "x")).toBe(false);
    expect(isUniqueViolation(new Error("boom"), "x")).toBe(false);
    expect(isUniqueViolation(null, "x")).toBe(false);
  });
});
