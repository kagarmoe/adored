import { build, type Plugin } from "esbuild";
import { globSync } from "node:fs";
import { relative } from "node:path";
import { describe, expect, it } from "vitest";
import { dbRelevant } from "./test-db-if-changed";

const root = new URL("../", import.meta.url).pathname;

// DB tests do render pages, but the components/features a page pulls in are
// excluded from the list by design (backstop: build, unit, e2e, and db-tests on
// every main push). Stubbing pages keeps their server-side imports in scope via routes.
const stubPageRenders: Plugin = {
  name: "stub-page-renders",
  setup(b) {
    b.onLoad({ filter: /\/src\/app\/.*\/(page|layout)\.tsx$/ }, () => ({ contents: "", loader: "js" }));
  },
};

describe("DB test path filter", () => {
  it("covers every file the DB suite and the CI DB-job scripts can load", async () => {
    // Routes are imported dynamically by the enumeration tests, so list them as entries.
    const entryPoints = [
      ...globSync("src/lib/db/**/*.test.ts", { cwd: root }),
      ...globSync("src/app/**/route.ts", { cwd: root }),
      "scripts/migrate.ts",
      "scripts/verify-auth.ts",
      "scripts/with-db-lock.ts",
    ];
    const { metafile } = await build({
      absWorkingDir: root,
      entryPoints,
      bundle: true,
      write: false,
      metafile: true,
      platform: "node",
      format: "esm",
      packages: "external",
      outdir: "out",
      logLevel: "silent",
      plugins: [stubPageRenders],
    });
    const loaded = Object.keys(metafile.inputs).map((f) => relative(root, `${root}${f}`));
    const missed = loaded.filter((f) => dbRelevant([f]).length === 0);
    expect(missed).toEqual([]);
  }, 60_000);

  it("skips UI-only and docs-only changes", () => {
    expect(dbRelevant(["src/components/ui/Button.tsx", "src/features/sorting/Card.tsx", "docs/x.md", "README.md", "e2e/sort.spec.ts"])).toEqual([]);
  });
});
