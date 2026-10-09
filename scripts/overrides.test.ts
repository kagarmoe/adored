import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The npm `overrides` in package.json patch around problems in OTHER people's
// packages. Each one is dead weight — or a silent lie — the moment its reason
// disappears upstream. These assertions fail loudly when that happens, instead
// of leaving a stale override pinning nothing (purses-9oxh.9).
const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf8"));
const lock = JSON.parse(readFileSync(resolve(__dirname, "../package-lock.json"), "utf8"));

describe("npm overrides still earn their keep", () => {
  it("postcss: exactly one copy in the tree, at the patched version", () => {
    // next@16 pins postcss 8.4.31 internally (GHSA-qx2v-qp2m-jg93). The
    // `$postcss` override forces every nested copy to the root's patched one.
    expect(pkg.overrides.postcss).toBe("$postcss");
    const copies = Object.entries(lock.packages)
      .filter(([path]) => path.endsWith("node_modules/postcss"))
      .map(([, meta]) => (meta as { version: string }).version);
    expect(copies).toEqual(["8.5.29"]);
  });

  it("esbuild: the @esbuild-kit override is still needed AND still applied", () => {
    // drizzle-kit still depends on the DEPRECATED @esbuild-kit chain
    // (core-utils: "Merged into tsx", last published 2023-09), which drags in
    // esbuild 0.18.20 (GHSA-67mh-4wv8-2f99). If drizzle-kit ever drops it,
    // this test fails and the override must be DELETED, not carried forever.
    const stillDependsOnDeadChain = Object.keys(lock.packages).some((p) =>
      p.includes("@esbuild-kit/core-utils"),
    );
    expect(
      stillDependsOnDeadChain,
      "drizzle-kit dropped @esbuild-kit — delete the scoped esbuild override from package.json",
    ).toBe(true);

    const nested = lock.packages["node_modules/@esbuild-kit/core-utils/node_modules/esbuild"] as
      | { version: string }
      | undefined;
    expect(nested?.version, "the scoped override stopped applying").toBe("0.25.12");
  });
});
