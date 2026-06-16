#!/usr/bin/env node
// ponytail: deterministic static "test presence" map — NOT runtime line coverage.
// Signals a source file as tested if (a) a test file imports its path, or
// (b) a test file references one of its exported names. Zero deps, no execution.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, extname, basename, dirname } from 'node:path';

const ROOT = resolve(process.argv[2] ?? '.');
const SRC = join(ROOT, 'src');
const TEST_DIRS = ['src', 'e2e', 'tests', 'test', '__tests__'];
const CODE_RE = /\.[jt]sx?$/;
const TEST_RE = /\.(test|spec)\.[jt]sx?$/;
const SKIP = new Set(['node_modules', '.next', 'dist', 'build', 'coverage', '.git', 'test-results', 'playwright-report']);

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (CODE_RE.test(name)) out.push(p);
  }
  return out;
}

const all = TEST_DIRS.flatMap((d) => walk(join(ROOT, d)));
const seen = new Set();
const files = all.filter((f) => (seen.has(f) ? false : seen.add(f)));

const isTest = (f) => TEST_RE.test(f) || f.includes('/e2e/') || f.includes('/__tests__/');
const testFiles = files.filter(isTest);
const srcFiles = files.filter((f) => !isTest(f) && f.startsWith(SRC) && !/\.d\.ts$/.test(f));

// Index test contents once.
const tests = testFiles.map((f) => ({ f, body: safeRead(f) }));
function safeRead(f) { try { return readFileSync(f, 'utf8'); } catch { return ''; } }

// Resolve an import specifier (relative or @/ alias) to an absolute path stem.
function resolveSpec(fromFile, spec) {
  if (spec.startsWith('@/')) return join(SRC, spec.slice(2));
  if (spec.startsWith('.')) return resolve(dirname(fromFile), spec);
  return null; // bare package import — ignore
}
const stem = (p) => p.replace(CODE_RE, '').replace(/\/index$/, '');

// For each test, collect the set of resolved import stems it pulls in.
const importStems = new Map(); // testFile -> Set<stem>
const importRe = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g;
for (const t of tests) {
  const set = new Set();
  for (const m of t.body.matchAll(importRe)) {
    const spec = m[1] || m[2] || m[3];
    const r = resolveSpec(t.f, spec);
    if (r) set.add(stem(r));
  }
  importStems.set(t.f, set);
}

// Extract exported identifier names from a source file.
const exportRe = /export\s+(?:async\s+)?(?:function|const|let|var|class|enum|type|interface)\s+([A-Za-z0-9_$]+)|export\s+\{([^}]+)\}|export\s+default\s+(?:function|class)\s+([A-Za-z0-9_$]+)/g;
function exportsOf(body) {
  const names = new Set();
  for (const m of body.matchAll(exportRe)) {
    if (m[1]) names.add(m[1]);
    if (m[3]) names.add(m[3]);
    if (m[2]) m[2].split(',').forEach((s) => {
      const n = s.trim().split(/\s+as\s+/)[0].trim();
      if (n && n !== 'default') names.add(n);
    });
  }
  return names;
}

// Concatenate all test bodies once for fast name-reference scan.
const allTestBody = tests.map((t) => t.body).join('\n');
const nameRefCache = new Map();
const referencedByName = (name) => {
  if (nameRefCache.has(name)) return nameRefCache.get(name);
  const re = new RegExp(`\\b${name.replace(/[$]/g, '\\$')}\\b`);
  const r = re.test(allTestBody);
  nameRefCache.set(name, r);
  return r;
};

const results = srcFiles.map((f) => {
  const myStem = stem(f);
  const importedBy = tests.filter((t) => importStems.get(t.f).has(myStem)).map((t) => relative(ROOT, t.f));
  const exps = [...exportsOf(safeRead(f))];
  const refExports = exps.filter(referencedByName);
  return {
    file: relative(ROOT, f),
    dir: relative(ROOT, dirname(f)),
    imported: importedBy.length > 0,
    importedBy,
    exports: exps,
    refExports,
    tested: importedBy.length > 0 || refExports.length > 0,
  };
});

// ---------- Report 1: per-module map ----------
console.log('# Static Test-Presence Report —', relative(process.env.HOME || '', ROOT) || ROOT);
console.log('\n## 1. Per-module map (tested = imported by a test OR an export referenced by name)\n');
const tested = results.filter((r) => r.tested);
const untested = results.filter((r) => !r.tested);
console.log(`Source modules: ${results.length} | tested: ${tested.length} | untested: ${untested.length}`);
console.log(`\n### Untested modules (${untested.length})`);
for (const r of untested.sort((a, b) => a.file.localeCompare(b.file))) console.log(`  ✗ ${r.file}`);

// ---------- Report 2: untested public exports ----------
console.log('\n## 2. Untested public exports (exported symbol never referenced in any test)\n');
let untestedExportCount = 0, totalExports = 0;
const gaps = [];
for (const r of results) {
  const missing = r.exports.filter((e) => !r.refExports.includes(e));
  totalExports += r.exports.length;
  untestedExportCount += missing.length;
  if (missing.length) gaps.push({ file: r.file, missing });
}
console.log(`Exports: ${totalExports} | referenced in tests: ${totalExports - untestedExportCount} | unreferenced: ${untestedExportCount}`);
for (const g of gaps.sort((a, b) => b.missing.length - a.missing.length).slice(0, 40)) {
  console.log(`  ${g.file}\n    └ ${g.missing.join(', ')}`);
}
if (gaps.length > 40) console.log(`  … and ${gaps.length - 40} more files with unreferenced exports`);

// ---------- Report 3: ratios ----------
console.log('\n## 3. Test-to-source ratio\n');
console.log(`Overall: ${testFiles.length} test files / ${srcFiles.length} source files = ${(testFiles.length / srcFiles.length).toFixed(2)}`);
console.log(`Module presence: ${(100 * tested.length / results.length).toFixed(0)}% of source modules have an associated test`);
const byDir = new Map();
for (const r of results) {
  const top = r.file.split('/').slice(0, 3).join('/');
  const e = byDir.get(top) || { total: 0, tested: 0 };
  e.total++; if (r.tested) e.tested++;
  byDir.set(top, e);
}
console.log('\nPer-directory presence:');
for (const [d, e] of [...byDir].sort((a, b) => a[0].localeCompare(b[0]))) {
  const pct = (100 * e.tested / e.total).toFixed(0).padStart(3);
  console.log(`  ${pct}%  ${e.tested}/${e.total}  ${d}`);
}
