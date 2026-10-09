import { describe, expect, it } from "vitest";
import { codeChanged } from "./code-changed.mjs";

describe("codeChanged", () => {
  it("ignores docs, agent config and git config", () => {
    expect(codeChanged(["README.md", "CLAUDE.md", "docs/x/y.md", ".claude/settings.json", ".githooks/pre-push", ".gitignore", "graphify-out/graph.json"])).toBe(false);
  });
  it("counts source, CI, unknown files and the doc map a test reads", () => {
    for (const f of ["src/a.ts", ".github/workflows/ci.yml", "new-tool.config", "docs/doc-ownership.md", "docs/design-system/a.html"])
      expect(codeChanged(["README.md", f]), f).toBe(true);
  });
  it("runs everything when it can't tell what changed", () => {
    expect(codeChanged([])).toBe(true);
  });
});
