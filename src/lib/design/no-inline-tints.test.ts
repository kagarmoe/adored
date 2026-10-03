import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Spec §5 / DESIGN.md §2: "Per-component inline tints are banned — use the tokens."
// A Tailwind opacity modifier on a colour utility (bg-x/30, bg-x/[.3], bg-x/(--a), ring-ink/10,
// hover:bg-y/40) is exactly that, and so is an arbitrary colour (bg-[#fff], text-[rgb(…)]).
// Fractions like w-1/2 or translate-y-1/2 are not colour utilities.
const TINT =
  /\b(?:bg|text|border|ring|outline|fill|stroke|divide|from|via|to|shadow|decoration|placeholder|caret|accent)-(?:[a-z]+(?:-[a-z]+)*\/(?:\d{1,3}|\[[^\]]+\]|\([^)]+\))|\[(?:#|rgb|hsl))/g;

const root = new URL("../../", import.meta.url).pathname; // src/
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe("no inline alpha tints", () => {
  const files = sources(root);
  it("scans the real source tree (a scan of nothing is a false green)", () => {
    expect(files.length).toBeGreaterThan(100);
  });
  it("no colour utility carries an /NN opacity modifier", () => {
    const hits = files.flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(TINT)].map((m) => `${f.slice(root.length)}: ${m[0]}`),
    );
    expect(hits).toEqual([]);
  });
});
