/// <reference lib="deno.ns" />
import { parsePlaywrightReport, splitSpecs } from "../models/test_suite.ts";

const eq = (got: unknown, want: unknown, what: string) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
};

Deno.test("parsePlaywrightReport counts nested specs and keeps each failure's last error", () => {
  const report = {
    suites: [{
      file: "a.spec.ts",
      specs: [{ title: "ok", tests: [{ projectName: "tablet", status: "expected", results: [{}] }] }],
      suites: [{
        specs: [
          { title: "skip", tests: [{ projectName: "tablet", status: "skipped", results: [] }] },
          {
            title: "boom",
            tests: [{
              projectName: "tablet",
              status: "unexpected",
              results: [{ error: { message: "first" } }, { error: { message: "retry" } }],
            }],
          },
        ],
      }],
    }],
    errors: [{ message: "webServer failed" }],
  };
  const got = parsePlaywrightReport(report);
  eq([got.total, got.passed, got.failed, got.skipped], [3, 1, 1, 1], "counts");
  eq(got.failures, [{ file: "a.spec.ts", title: "boom", project: "tablet", error: "retry" }], "failures");
  eq(got.setupErrors, ["webServer failed"], "setupErrors");
});

Deno.test("splitSpecs: whitespace-separated paths, empty input means none", () => {
  eq(splitSpecs(" e2e/a.spec.ts  e2e/b.spec.ts\n"), ["e2e/a.spec.ts", "e2e/b.spec.ts"], "two");
  eq(splitSpecs(""), [], "empty");
  eq(splitSpecs(undefined), [], "undefined");
});
