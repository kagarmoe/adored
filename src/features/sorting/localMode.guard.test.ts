import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

// The sorting components carry a `{ kind: "local" }` submit arm for the /welcome
// walkthrough ONLY. Production sort routes must always use `{ kind: "session" }`
// so decisions actually persist. This guard fails loudly if a production route
// ever wires a component into local (no-fetch) mode.
describe("local mode is walkthrough-only", () => {
  it("production routes never use local mode", () => {
    const hits = execSync(String.raw`grep -rln 'kind: "local"' src/app/collections || true`, {
      encoding: "utf8",
    }).trim();
    expect(hits).toBe("");
  });
});
