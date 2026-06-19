import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseOwnership, checkDocSync } from "./doc-check.mjs";

const MAP = readFileSync(new URL("../../docs/doc-ownership.md", import.meta.url), "utf8");
const entries = parseOwnership(MAP);

describe("parseOwnership", () => {
  it("parses exact + prefix entries from the delimited block", () => {
    expect(entries.length).toBeGreaterThan(5);
    expect(entries.find((e) => e.entry === "src/lib/env.ts")?.docs).toEqual(
      expect.arrayContaining(["README.md", "docs/ARCHITECTURE.md"]));
    expect(entries.find((e) => e.entry === "src/server/dal/")).toBeTruthy();
  });
  it("every mapped doc path exists on disk", () => {
    for (const e of entries) for (const d of e.docs)
      expect(() => readFileSync(new URL("../../" + d, import.meta.url))).not.toThrow();
  });
});

describe("checkDocSync", () => {
  it("flags an exact-mapped source whose docs weren't touched", () => {
    const out = checkDocSync(["src/lib/env.ts"], entries);
    expect(out).toHaveLength(1);
    expect(out[0].missingDocs).toEqual(expect.arrayContaining(["README.md", "docs/ARCHITECTURE.md"]));
  });
  it("flags a DIRECTORY-PREFIX-mapped source (dal/**) whose doc is untouched", () => {
    expect(checkDocSync(["src/server/dal/collection-access.ts"], entries)).toHaveLength(1);
  });
  it("is clean when ANY ONE mapped doc is touched (lenient backstop)", () => {
    // schema.ts maps to 3 docs; touching just README satisfies the nudge.
    expect(checkDocSync(["src/lib/db/schema.ts", "README.md"], entries)).toHaveLength(0);
  });
  it("ignores an unmapped source file", () => {
    expect(checkDocSync(["src/features/foo/Bar.tsx"], entries)).toHaveLength(0);
  });
  it("unions docs across multiple matching entries", () => {
    // src/lib/design/foo.css matches the src/lib/design/ prefix → needs DESIGN.md
    expect(checkDocSync(["src/lib/design/foo.css"], entries)[0].missingDocs).toContain("DESIGN.md");
  });
  it("never requires PRODUCT.md or TONE.md", () => {
    const all = entries.flatMap((e) => e.docs);
    expect(all).not.toContain("PRODUCT.md");
    expect(all).not.toContain("TONE.md");
  });
});
