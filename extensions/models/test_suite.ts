/// <reference lib="deno.ns" />
/**
 * Runs the project's test suites and records the results as queryable data:
 * unit coverage totals, and end-to-end (Playwright) failures.
 *
 * @module
 */
import { z } from "npm:zod@4";

const GlobalArgsSchema = z.object({
  minLinesPct: z.number().min(0).max(100).default(0).describe(
    "Line-coverage floor; the stored record flags belowFloor when under it",
  ),
});
type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

const Pct = z.object({ total: z.number(), covered: z.number(), pct: z.number() });
const CoverageSchema = z.object({
  ranAt: z.iso.datetime(),
  testsPassed: z.boolean(),
  exitCode: z.number(),
  lines: Pct,
  statements: Pct,
  functions: Pct,
  branches: Pct,
  minLinesPct: z.number(),
  belowFloor: z.boolean(),
  reportDir: z.string(),
});

const E2eFailure = z.object({
  file: z.string(),
  title: z.string(),
  project: z.string(),
  error: z.string(),
});
const E2eSchema = z.object({
  ranAt: z.iso.datetime(),
  exitCode: z.number(),
  total: z.number(),
  passed: z.number(),
  failed: z.number(),
  skipped: z.number(),
  failures: z.array(E2eFailure),
  setupErrors: z.array(z.string()),
  reportDir: z.string(),
});

/** Test-suite model: unit coverage and e2e results. */
export const model = {
  type: "@kagarmoe/test-suite",
  version: "2026.10.01.1",
  globalArguments: GlobalArgsSchema,
  resources: {
    coverage: {
      description: "Coverage totals from the latest unit-test run",
      schema: CoverageSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    e2e: {
      description: "Playwright run totals and every failed test with its error",
      schema: E2eSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
  },
  methods: {
    coverage: {
      description: "Run `vitest run --coverage` and store the coverage-summary totals",
      arguments: z.object({}),
      execute: async (
        _args: Record<string, never>,
        context: {
          globalArgs: GlobalArgs;
          repoDir: string;
          signal: AbortSignal;
          logger: { info: (msg: string, props?: Record<string, unknown>) => void };
          writeResource: (
            spec: string,
            name: string,
            data: Record<string, unknown>,
          ) => Promise<{ name: string }>;
        },
      ) => {
        const cmd = new Deno.Command("npx", {
          args: ["vitest", "run", "--passWithNoTests", "--coverage", "--coverage.reporter=json-summary"],
          cwd: context.repoDir,
          signal: context.signal,
          stdout: "piped",
          stderr: "piped",
        });
        const out = await cmd.output();
        context.logger.info("vitest exited {code}", { code: out.code });
        const summaryPath = `${context.repoDir}/coverage/coverage-summary.json`;
        let total: Record<string, z.infer<typeof Pct>>;
        try {
          total = JSON.parse(await Deno.readTextFile(summaryPath)).total;
        } catch {
          throw new Error(
            `No coverage summary at ${summaryPath}. vitest stderr:\n${new TextDecoder().decode(out.stderr).slice(-2000)}`,
          );
        }
        const { minLinesPct } = context.globalArgs;
        const handle = await context.writeResource("coverage", "coverage-total", {
          ranAt: new Date().toISOString(),
          testsPassed: out.code === 0,
          exitCode: out.code,
          lines: total.lines,
          statements: total.statements,
          functions: total.functions,
          branches: total.branches,
          minLinesPct,
          belowFloor: total.lines.pct < minLinesPct,
          reportDir: `${context.repoDir}/coverage`,
        });
        return { dataHandles: [handle] };
      },
    },
    e2e: {
      description: "Run `npx playwright test` (builds + serves the app, docker test DB) and store failures",
      arguments: z.object({
        spec: z.string().optional().describe("Optional spec path filter, e.g. e2e/smoke.spec.ts"),
      }),
      execute: async (
        args: { spec?: string },
        context: {
          repoDir: string;
          signal: AbortSignal;
          logger: { info: (msg: string, props?: Record<string, unknown>) => void };
          writeResource: (
            spec: string,
            name: string,
            data: Record<string, unknown>,
          ) => Promise<{ name: string }>;
        },
      ) => {
        const out = await new Deno.Command("npx", {
          args: ["playwright", "test", ...(args.spec ? [args.spec] : [])],
          cwd: context.repoDir,
          signal: context.signal,
          stdout: "piped",
          stderr: "piped",
        }).output();
        context.logger.info("playwright exited {code}", { code: out.code });
        const reportPath = `${context.repoDir}/playwright-report/results.json`;
        let report: { suites: unknown[]; errors?: Array<{ message?: string }> };
        try {
          report = JSON.parse(await Deno.readTextFile(reportPath));
        } catch {
          throw new Error(
            `No Playwright JSON report at ${reportPath}. stderr:\n${new TextDecoder().decode(out.stderr).slice(-2000)}`,
          );
        }
        // Playwright nests suites; flatten to specs and read each test's final result.
        const specs: Array<{ file: string; title: string; tests: Array<{ projectName: string; status: string; results: Array<{ error?: { message?: string } }> }> }> = [];
        const walk = (suite: { file?: string; specs?: typeof specs; suites?: unknown[] }) => {
          for (const sp of suite.specs ?? []) specs.push({ ...sp, file: sp.file ?? suite.file ?? "" });
          for (const child of suite.suites ?? []) walk(child as typeof suite);
        };
        for (const s of report.suites) walk(s as Parameters<typeof walk>[0]);
        const counts = { total: 0, passed: 0, failed: 0, skipped: 0 };
        const failures: z.infer<typeof E2eFailure>[] = [];
        for (const sp of specs) {
          for (const t of sp.tests) {
            counts.total++;
            if (t.status === "expected") counts.passed++;
            else if (t.status === "skipped") counts.skipped++;
            else {
              counts.failed++;
              failures.push({
                file: sp.file,
                title: sp.title,
                project: t.projectName,
                error: (t.results.at(-1)?.error?.message ?? t.status).slice(0, 2000),
              });
            }
          }
        }
        const handle = await context.writeResource("e2e", "e2e-latest", {
          ranAt: new Date().toISOString(),
          exitCode: out.code,
          ...counts,
          failures,
          // webServer/globalSetup failures land here, not in any test
          setupErrors: (report.errors ?? []).map((e) => (e.message ?? "").slice(0, 2000)),
          reportDir: `${context.repoDir}/playwright-report`,
        });
        return { dataHandles: [handle] };
      },
    },
  },
};
