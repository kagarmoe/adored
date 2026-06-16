#!/usr/bin/env node
// Append one metrics row per main deploy and regenerate the trends page.
// Reads whatever artifacts exist this run (coverage and/or e2e), updates
// <site>/history.json (append-only, deduped by sha, capped), and writes
// <site>/trends.html. Pure git+node — no third-party action, no chart lib.
//
// Usage: node append-history.mjs <siteDir> <artifactsDir>
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const siteDir = process.argv[2] || "site";
const artDir = process.argv[3] || "_artifacts";
const CAP = 200; // keep the last N deploys

const readJson = (p) => {
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
};

// Coverage (unit/component only) — coverage-summary.json's `total`.
const cov = (() => {
  const t = readJson(join(artDir, "coverage", "coverage-summary.json"))?.total;
  if (!t) return null;
  return { lines: t.lines.pct, branches: t.branches.pct, functions: t.functions.pct };
})();

// E2E — Playwright json reporter `stats`.
const e2e = (() => {
  const s = readJson(join(artDir, "e2e", "results.json"))?.stats;
  if (!s) return null;
  return {
    passed: s.expected ?? 0,
    failed: s.unexpected ?? 0,
    flaky: s.flaky ?? 0,
    skipped: s.skipped ?? 0,
    durationMs: Math.round(s.duration ?? 0),
  };
})();

const sha = (process.env.GITHUB_SHA || "").slice(0, 7);
const ts = new Date().toISOString();

const histPath = join(siteDir, "history.json");
const history = readJson(histPath) || [];

// Dedupe by sha: re-running the same commit replaces its row rather than
// stacking duplicate points. Carry forward the report we DIDN'T produce this
// run (e.g. e2e skipped on a non-UI push) so a row never loses data it had.
const prev = history.length ? history[history.length - 1] : null;
const carried = prev && prev.sha === sha ? prev : prev || {};
const entry = {
  ts,
  sha,
  cov: cov ?? carried.cov ?? null,
  e2e: e2e ?? carried.e2e ?? null,
};
if (prev && prev.sha === sha) history[history.length - 1] = entry;
else history.push(entry);
while (history.length > CAP) history.shift();

writeFileSync(histPath, JSON.stringify(history, null, 0) + "\n");

// ---- render trends.html ----
const spark = (vals, w = 260, h = 44, pad = 3) => {
  const nums = vals.filter((v) => v != null);
  if (nums.length < 2) return '<span class="soft">not enough data</span>';
  const min = Math.min(...nums), max = Math.max(...nums), range = max - min || 1;
  const step = (w - 2 * pad) / (vals.length - 1);
  const pts = vals
    .map((v, i) => v == null ? null
      : `${(pad + i * step).toFixed(1)},${(h - pad - ((v - min) / range) * (h - 2 * pad)).toFixed(1)}`)
    .filter(Boolean).join(" ");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">` +
    `<polyline fill="none" stroke="currentColor" stroke-width="1.5" points="${pts}"/></svg>`;
};

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const fmtDur = (ms) => ms == null ? "—" : `${Math.round(ms / 1000)}s`;
const covCells = history.map((h) => h.cov?.lines ?? null);
const durCells = history.map((h) => h.e2e?.durationMs ?? null);

const rows = [...history].reverse().map((h, idx) => {
  const date = esc(h.ts.replace("T", " ").slice(0, 16));
  const c = h.cov ? `${h.cov.lines}%` : "—";
  const e = h.e2e ? `${h.e2e.passed}/${h.e2e.passed + h.e2e.failed}${h.e2e.flaky ? ` (${h.e2e.flaky} flaky)` : ""}` : "—";
  const dur = fmtDur(h.e2e?.durationMs);
  const cur = idx === 0 ? ' class="cur"' : "";
  return `<tr${cur}><td>${date}</td><td><code>${esc(h.sha || "—")}</code></td><td>${c}</td><td>${e}</td><td>${dur}</td></tr>`;
}).join("\n");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Purseinator — Trends</title>
<style>
:root{--bg:#0f1115;--card:#171a21;--ink:#e6e8ee;--soft:#9aa3b2;--line:#262b35;--accent:#7c9cff}
@media(prefers-color-scheme:light){:root{--bg:#f6f7f9;--card:#fff;--ink:#1a1d24;--soft:#5b6472;--line:#e3e6eb;--accent:#3056d3}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:6vh 5vw;display:flex;flex-direction:column;align-items:center}
.wrap{max-width:820px;width:100%}h1{font-size:1.5rem;margin:0 0 .25rem;letter-spacing:-.02em}a{color:var(--accent)}.soft{color:var(--soft)}
.cards{display:grid;gap:1rem;grid-template-columns:1fr 1fr;margin:1.5rem 0}
.spark{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:1rem 1.2rem}
.spark h2{margin:0 0 .1rem;font-size:.95rem}.spark .now{font-size:1.5rem;font-weight:600}.spark svg{color:var(--accent);display:block;margin-top:.4rem;width:100%;height:auto}
table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{text-align:left;padding:.5rem .6rem;border-bottom:1px solid var(--line)}th{color:var(--soft);font-weight:500}
tr.cur td{background:color-mix(in srgb,var(--accent) 12%,transparent)}code{background:var(--line);padding:.05em .35em;border-radius:4px}
@media(max-width:560px){.cards{grid-template-columns:1fr}}
</style></head><body><div class="wrap">
<h1>Trends</h1><p class="soft"><a href="./">← dashboard</a> · last ${history.length} deploy(s) to <code>main</code></p>
<div class="cards">
<div class="spark"><h2>Coverage (lines)</h2><div class="now">${cov?.lines ?? history.at(-1)?.cov?.lines ?? "—"}%</div>${spark(covCells)}</div>
<div class="spark"><h2>E2E duration</h2><div class="now">${fmtDur(history.at(-1)?.e2e?.durationMs)}</div>${spark(durCells)}</div>
</div>
<table><thead><tr><th>When (UTC)</th><th>Commit</th><th>Cov lines</th><th>E2E pass/total</th><th>Duration</th></tr></thead>
<tbody>
${rows}
</tbody></table>
<p class="soft" style="margin-top:1.25rem;font-size:.8rem">Coverage = unit/component tests only; excludes the DB integration suite. Newest row highlighted.</p>
</div></body></html>
`;
writeFileSync(join(siteDir, "trends.html"), html);
console.log(`history: ${history.length} rows; cov=${cov ? cov.lines + "%" : "carried/none"}; e2e=${e2e ? e2e.passed + "p/" + e2e.failed + "f" : "carried/none"}`);
