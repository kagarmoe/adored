import { globSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
// CI runs e2e selectively from an area -> spec map in ci.yml ("Select e2e specs").
// A spec missing from the map silently never runs on a selective PR; a listed spec
// that no longer exists makes Playwright fail. Both halves are checked here.
const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const start = ci.indexOf("- name: Select e2e specs");
const block = ci.slice(start, ci.indexOf("- name: Run e2e", start));
const listed = new Set(block.match(/e2e\/[\w-]+\.spec\.ts/g) ?? []);
const onDisk = readdirSync(new URL("../e2e/", import.meta.url))
  .filter((f) => f.endsWith(".spec.ts"))
  .map((f) => `e2e/${f}`);
describe("ci.yml e2e area map", () => {
  it("finds the selection step", () => {
    expect(start).toBeGreaterThan(-1);
    expect(listed.size).toBeGreaterThan(3);
  });
  it("lists every e2e spec on disk in the floor or an area", () => {
    expect(onDisk.filter((s) => !listed.has(s))).toEqual([]);
  });
  it("lists only specs that exist", () => {
    expect([...listed].filter((s) => !onDisk.includes(s))).toEqual([]);
  });
  it("sort-area changes also run lists-and-home (its ActionBar/archived-card geometry)", () => {
    expect(block).toMatch(/A_SORT" = "true" \]; then\n(?:\s*#.*\n)*\s*add "[^"]*e2e\/lists-and-home\.spec\.ts/);
  });
});

describe("ci.yml changes filters", () => {
  // A filter pattern that matches nothing silently selects nothing (e.g. a renamed lib file
  // drops its e2e area). Every pattern must match at least one path in the repo.
  const repoRoot = new URL("../", import.meta.url).pathname;
  const filters = ci.slice(ci.indexOf("filters: |"), ci.indexOf("\n  e2e:"));
  const paths = [...filters.matchAll(/^\s+- '([^']+)'$/gm)].map((m) => m[1]);
  it("finds the filter list", () => {
    expect(paths.length).toBeGreaterThan(20);
  });
  it("every pattern matches at least one path", () => {
    // Root extension catch-alls ('*.js' under code:) guard future root configs; they may match nothing.
    const rootCatchAll = /^\*\.[a-z]+$/;
    const missing = paths.filter((p) => !rootCatchAll.test(p) && globSync(p, { cwd: repoRoot }).length === 0);
    expect(missing).toEqual([]);
  });
});
