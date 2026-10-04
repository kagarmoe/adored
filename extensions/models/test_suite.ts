/// <reference lib="deno.ns" />
/**
 * Runs the project's test suites and pre-PR gates, and records the results as
 * queryable data: one record per gate (exit code, duration, output tail), unit
 * coverage totals, end-to-end (Playwright) failures per viewport, and screenshot
 * captures. A failing gate is recorded, not thrown, so a workflow runs every gate
 * and its assert steps report every failure at once.
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

/** The npm scripts `gate` may run (allow-list: never an arbitrary command). */
const GATE_SCRIPTS = ["lint", "test:ci", "build", "auth:verify", "test:db"] as const;
const VIEWPORTS = ["tablet", "phone"] as const;
/** How much of a gate's combined output the record keeps. */
const OUTPUT_TAIL_CHARS = 4000;

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

const GateSchema = z.object({
  ranAt: z.iso.datetime(),
  script: z.enum(GATE_SCRIPTS),
  exitCode: z.number(),
  passed: z.boolean(),
  durationMs: z.number(),
  outputTail: z.string(),
});

const E2eFailure = z.object({
  file: z.string(),
  title: z.string(),
  project: z.string(),
  error: z.string(),
});
const E2eSchema = z.object({
  ranAt: z.iso.datetime(),
  viewport: z.enum(VIEWPORTS).default("tablet"),
  /** True when nothing ran (a phone run with no specs given). */
  notRun: z.boolean().default(false),
  exitCode: z.number(),
  total: z.number(),
  passed: z.number(),
  failed: z.number(),
  skipped: z.number(),
  failures: z.array(E2eFailure),
  setupErrors: z.array(z.string()),
  reportDir: z.string(),
});

const ScreenshotsSchema = z.object({
  ranAt: z.iso.datetime(),
  viewport: z.enum(VIEWPORTS),
  shots: z.string(),
  skipped: z.boolean(),
  exitCode: z.number(),
  files: z.array(z.string()),
  outputTail: z.string(),
});

type Ctx = {
  globalArgs: GlobalArgs;
  repoDir: string;
  signal: AbortSignal;
  logger: { info: (msg: string, props?: Record<string, unknown>) => void };
  writeResource: (spec: string, name: string, data: Record<string, unknown>) => Promise<{ name: string }>;
};

/** Run `npm run <script> [-- args]` in the repo; never throws on a non-zero exit. */
async function runNpm(
  context: Ctx,
  script: string,
  args: string[] = [],
  env: Record<string, string> = {},
): Promise<{ code: number; durationMs: number; tail: string }> {
  const started = Date.now();
  const out = await new Deno.Command("npm", {
    args: ["run", script, ...(args.length ? ["--", ...args] : [])],
    cwd: context.repoDir,
    env,
    signal: context.signal,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const text = new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr);
  context.logger.info("npm run {script} exited {code}", { script, code: out.code });
  return { code: out.code, durationMs: Date.now() - started, tail: text.slice(-OUTPUT_TAIL_CHARS) };
}

/** Space-separated spec paths from a workflow input ("" → none). */
export const splitSpecs = (s?: string) => (s ?? "").split(/\s+/).filter(Boolean);

type PwSpec = {
  file?: string;
  title: string;
  tests: Array<{ projectName: string; status: string; results: Array<{ error?: { message?: string } }> }>;
};
type PwSuite = { file?: string; specs?: PwSpec[]; suites?: PwSuite[] };

/** Playwright's JSON report → counts, every failure with its last error, setup errors. */
export function parsePlaywrightReport(report: { suites: unknown[]; errors?: Array<{ message?: string }> }) {
  // Playwright nests suites; flatten to specs and read each test's final result.
  const flat: Array<PwSpec & { file: string }> = [];
  const walk = (suite: PwSuite) => {
    for (const sp of suite.specs ?? []) flat.push({ ...sp, file: sp.file ?? suite.file ?? "" });
    for (const child of suite.suites ?? []) walk({ file: suite.file, ...child });
  };
  for (const s of report.suites) walk(s as PwSuite);
  const counts = { total: 0, passed: 0, failed: 0, skipped: 0 };
  const failures: z.infer<typeof E2eFailure>[] = [];
  for (const sp of flat) {
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
  // webServer/globalSetup failures land here, not in any test
  const setupErrors = (report.errors ?? []).map((e) => (e.message ?? "").slice(0, 2000));
  return { ...counts, failures, setupErrors };
}

/** Test-suite model: pre-PR gates, unit coverage, e2e results, screenshots. */
export const model = {
  type: "@kagarmoe/test-suite",
  version: "2026.10.04.1",
  globalArguments: GlobalArgsSchema,
  upgrades: [
    {
      toVersion: "2026.10.04.1",
      description: "Add gate and screenshots methods and the e2e viewport argument; no globalArguments change",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
  ],
  resources: {
    coverage: {
      description: "Coverage totals from the latest unit-test run",
      schema: CoverageSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    gate: {
      description: "One pre-PR gate (an npm script): exit code, duration and output tail",
      schema: GateSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    e2e: {
      description: "Playwright run totals per viewport and every failed test with its error",
      schema: E2eSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    screenshots: {
      description: "A screenshot capture run (npm run screenshots) per viewport and the files it wrote",
      schema: ScreenshotsSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
  },
  methods: {
    gate: {
      description: "Run one pre-PR gate (`npm run <script>`) and record its exit code; a failure is recorded, not thrown",
      arguments: z.object({
        script: z.enum(GATE_SCRIPTS).describe("The npm script to run: lint, test:ci, build, auth:verify or test:db"),
      }),
      execute: async (args: { script: (typeof GATE_SCRIPTS)[number] }, context: Ctx) => {
        const run = await runNpm(context, args.script);
        const handle = await context.writeResource("gate", `gate-${args.script.replace(":", "-")}`, {
          ranAt: new Date().toISOString(),
          script: args.script,
          exitCode: run.code,
          passed: run.code === 0,
          durationMs: run.durationMs,
          outputTail: run.tail,
        });
        return { dataHandles: [handle] };
      },
    },
    coverage: {
      description: "Run `vitest run --coverage` and store the coverage-summary totals",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, context: Ctx) => {
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
      description:
        "Run `npm run test:e2e` (DB lock from outside; builds + serves the app) on one viewport and store failures. A phone run with no specs is recorded as skipped.",
      arguments: z.object({
        spec: z.string().optional().describe(
          "Space-separated spec paths, e.g. 'e2e/smoke.spec.ts e2e/sort-journey.spec.ts' (tablet: empty = full suite)",
        ),
        viewport: z.enum(VIEWPORTS).default("tablet").describe("tablet (default project) or phone (PW_VIEWPORT=phone)"),
      }),
      execute: async (args: { spec?: string; viewport?: (typeof VIEWPORTS)[number] }, context: Ctx) => {
        const viewport = args.viewport ?? "tablet";
        const specs = splitSpecs(args.spec);
        // The tablet record keeps its historical name (adored-health asserts on it).
        const name = viewport === "phone" ? "e2e-phone" : "e2e-latest";
        const reportDir = `${context.repoDir}/playwright-report`;
        if (viewport === "phone" && specs.length === 0) {
          const handle = await context.writeResource("e2e", name, {
            ranAt: new Date().toISOString(), viewport, notRun: true, exitCode: 0,
            total: 0, passed: 0, failed: 0, skipped: 0, failures: [], setupErrors: [], reportDir,
          });
          return { dataHandles: [handle] };
        }
        const reportPath = `${reportDir}/results.json`;
        // A report left by an earlier run must never be read as this run's result (e.g. the
        // DB lock is busy and Playwright never starts): delete it first, so a missing report throws.
        await Deno.remove(reportPath).catch(() => {});
        const run = await runNpm(context, "test:e2e", specs, viewport === "phone" ? { PW_VIEWPORT: "phone" } : {});
        let report: { suites: unknown[]; errors?: Array<{ message?: string }> };
        try {
          report = JSON.parse(await Deno.readTextFile(reportPath));
        } catch {
          throw new Error(`No Playwright JSON report at ${reportPath} (exit ${run.code}). Output tail:\n${run.tail.slice(-2000)}`);
        }
        const handle = await context.writeResource("e2e", name, {
          ranAt: new Date().toISOString(),
          viewport,
          notRun: false,
          exitCode: run.code,
          ...parsePlaywrightReport(report),
          reportDir,
        });
        return { dataHandles: [handle] };
      },
    },
    screenshots: {
      description:
        "Run `npm run screenshots` for the given surfaces on one viewport and record the PNGs it wrote. No surfaces → recorded as skipped.",
      arguments: z.object({
        shots: z.string().optional().describe("Comma-separated capture surfaces (SHOTS), e.g. 'home,ranking,login'"),
        viewport: z.enum(VIEWPORTS).default("tablet"),
      }),
      execute: async (args: { shots?: string; viewport?: (typeof VIEWPORTS)[number] }, context: Ctx) => {
        const viewport = args.viewport ?? "tablet";
        const shots = (args.shots ?? "").trim();
        if (!shots) {
          const handle = await context.writeResource("screenshots", `screenshots-${viewport}`, {
            ranAt: new Date().toISOString(), viewport, shots, skipped: true, exitCode: 0, files: [], outputTail: "",
          });
          return { dataHandles: [handle] };
        }
        const env: Record<string, string> = { SHOTS: shots };
        if (viewport === "phone") env.PW_VIEWPORT = "phone";
        const started = Date.now();
        const run = await runNpm(context, "screenshots", [], env);
        const files: string[] = [];
        try {
          for await (const entry of Deno.readDir(`${context.repoDir}/pr-screenshots`)) {
            if (!entry.isFile || !entry.name.endsWith(`-${viewport}.png`)) continue;
            // Only this run's captures; earlier runs' PNGs stay in the folder.
            const mtime = (await Deno.stat(`${context.repoDir}/pr-screenshots/${entry.name}`)).mtime?.getTime() ?? 0;
            if (mtime >= started) files.push(`pr-screenshots/${entry.name}`);
          }
        } catch {
          // no directory: nothing captured; the exit code says why
        }
        const handle = await context.writeResource("screenshots", `screenshots-${viewport}`, {
          ranAt: new Date().toISOString(),
          viewport,
          shots,
          skipped: false,
          exitCode: run.code,
          files: files.sort(),
          outputTail: run.tail,
        });
        return { dataHandles: [handle] };
      },
    },
  },
};
