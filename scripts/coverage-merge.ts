import libCoverage, { type CoverageMapData, type CoverageSummaryData } from "istanbul-lib-coverage";
import { readFileSync } from "node:fs";

/** Union-merge any number of coverage datasets into one total summary. */
export function mergeCoverageData(datas: CoverageMapData[]): CoverageSummaryData {
  const map = libCoverage.createCoverageMap({});
  for (const d of datas) map.merge(d);
  const summary = libCoverage.createCoverageSummary();
  for (const f of map.files()) summary.merge(map.fileCoverageFor(f).toSummary());
  return summary.toJSON();
}

export function mergeCoverageFiles(paths: string[]): CoverageSummaryData {
  return mergeCoverageData(paths.map((p) => JSON.parse(readFileSync(p, "utf8")) as CoverageMapData));
}

function main(): void {
  const args = process.argv.slice(2);
  const fi = args.indexOf("--floor");
  const floor = fi >= 0 ? Number(args[fi + 1]) : 0;
  const paths = args.filter((a, i) => a !== "--floor" && args[i - 1] !== "--floor");
  if (paths.length === 0) throw new Error("usage: coverage-merge [--floor <pct>] <coverage-final.json...>");
  const s = mergeCoverageFiles(paths);
  console.log(
    `Merged coverage — lines ${s.lines.pct}% (${s.lines.covered}/${s.lines.total}), ` +
      `statements ${s.statements.pct}%, functions ${s.functions.pct}%, branches ${s.branches.pct}%`,
  );
  if (s.lines.pct < floor) {
    console.error(`::error::Merged line coverage ${s.lines.pct}% is below floor ${floor}%`);
    process.exit(1);
  }
}

// esbuild-register compiles to CJS, so require.main === module holds for the CLI entry.
if (require.main === module) main();
