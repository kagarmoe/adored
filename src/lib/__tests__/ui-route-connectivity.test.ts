/**
 * UI↔Route connectivity contract test.
 *
 * Walks every "use client" file under src/ and extracts fetch / apiGet /
 * apiPost / apiPatch call sites via the TypeScript compiler AST.  Builds
 * the route table from src/app/api ** /route.ts.  Asserts every UI call
 * targets a real route+method.
 *
 * Fails LOUD on any URL that cannot be statically resolved (never silently
 * skips).  See plan: docs/superpowers/plans/2026-06-21-coverage-phase1-connectivity.md
 */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Dependency-free recursive directory walk (replaces glob transitive dep)
// ---------------------------------------------------------------------------

/**
 * Recursively collect all files under `dir` whose names match `ext`.
 * Uses only node:fs — no glob dependency.
 */
function walkFiles(dir: string, ext: RegExp): string[] {
  const results: string[] = [];
  function recurse(current: string) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        recurse(full);
      } else if (entry.isFile() && ext.test(entry.name)) {
        results.push(full);
      }
    }
  }
  recurse(dir);
  return results;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiCall {
  url: string;
  method: string;
  file: string;
  line: number;
}

interface UnresolvedCall {
  file: string;
  line: number;
  reason: string;
}

interface RouteEntry {
  pattern: string; // normalised, e.g. /api/collections/[param]/items
  methods: Set<string>;
}

// ---------------------------------------------------------------------------
// URL normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a URL for matching:
 *   - strip query string
 *   - replace every ${…} template slot with [param]
 *   - replace every named Next.js segment [id]/[itemId]/[photoId]/etc. with [param]
 *   - drop trailing slash
 */
function normalizeUrl(raw: string): string {
  // strip query string
  let u = raw.split("?")[0];
  // template placeholders → [param]
  u = u.replace(/\$\{[^}]*\}/g, "[param]");
  // Next.js dynamic segments → [param]
  u = u.replace(/\[[^\]]+\]/g, "[param]");
  // drop trailing slash
  u = u.replace(/\/$/, "");
  return u;
}

// ---------------------------------------------------------------------------
// Route table builder
// ---------------------------------------------------------------------------

/**
 * Derive the URL pattern from a route.ts file path.
 * e.g. src/app/api/collections/[id]/items/route.ts → /api/collections/[param]/items
 */
function routePatternFromFile(filePath: string): string {
  // normalise to forward-slashes and find the segment after src/app
  const normalised = filePath.replace(/\\/g, "/");
  const marker = "src/app/";
  const idx = normalised.indexOf(marker);
  if (idx === -1) throw new Error(`Cannot derive route pattern from ${filePath}`);
  let segment = normalised.slice(idx + marker.length);
  // strip trailing /route.ts
  segment = segment.replace(/\/route\.ts$/, "");
  return normalizeUrl("/" + segment);
}

/**
 * Extract exported HTTP method names from a route.ts source text.
 * Handles both:
 *   export async function GET(…)
 *   export { handler as GET, handler as POST }
 */
function methodsFromRoute(src: string): string[] {
  const methods = new Set<string>();
  const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

  // export (async )? function METHOD
  const fnRe = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
  let m: RegExpExecArray | null;
  while ((m = fnRe.exec(src)) !== null) {
    methods.add(m[1]);
  }

  // export { handler as GET, handler as POST }
  const reExportRe = /export\s*\{([^}]+)\}/g;
  while ((m = reExportRe.exec(src)) !== null) {
    const inner = m[1];
    const aliasRe = /\bas\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
    let a: RegExpExecArray | null;
    while ((a = aliasRe.exec(inner)) !== null) {
      methods.add(a[1]);
    }
    // also handle `GET` exported directly without alias
    for (const method of HTTP_METHODS) {
      const directRe = new RegExp(`\\b${method}\\b`);
      if (directRe.test(inner) && !inner.includes(`as ${method}`)) {
        // e.g. export { GET, POST } — direct name
        const directNameRe = new RegExp(`(?:^|[,{\\s])${method}(?:[,}\\s]|$)`);
        if (directNameRe.test(inner)) methods.add(method);
      }
    }
  }

  return Array.from(methods);
}

function buildRouteTable(repoRoot: string): RouteEntry[] {
  const apiDir = path.join(repoRoot, "src", "app", "api");
  const routeFiles = walkFiles(apiDir, /^route\.ts$/).filter((f) =>
    f.endsWith("route.ts"),
  );
  return routeFiles.map((abs) => {
    const src = fs.readFileSync(abs, "utf-8");
    const pattern = routePatternFromFile(abs);
    const methods = new Set(methodsFromRoute(src));
    return { pattern, methods };
  });
}

// ---------------------------------------------------------------------------
// AST-based call extractor
// ---------------------------------------------------------------------------

/**
 * Extract all /api/* call sites from a single source file.
 *
 * Recognised forms:
 *   fetch(url, { method: "X" })          — method defaults to GET
 *   apiGet(url)                          → GET
 *   apiPost(url, body)                   → POST
 *   apiPatch(url, body)                  → PATCH
 *
 * URL arg may be:
 *   - string literal           "/api/foo"
 *   - template literal         `/api/collections/${c}/items`
 *   - identifier bound to one  const patchUrl = `/api/…`; fetch(patchUrl, …)
 *
 * Unresolvable args are pushed to `unresolved` with file:line — never silently dropped.
 */
function extractCalls(
  filePath: string,
  src: string,
): { calls: ApiCall[]; unresolved: UnresolvedCall[] } {
  const calls: ApiCall[] = [];
  const unresolved: UnresolvedCall[] = [];

  const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(filePath, src, ts.ScriptTarget.Latest, true, scriptKind);

  // --- First pass: collect top-level / function-body const bindings of string/template ---
  // Map from identifier name → normalised URL pattern string
  const constBindings = new Map<string, string>();

  function collectBindings(node: ts.Node) {
    // const <name> = <StringLiteral | TemplateLiteral>
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const init = node.initializer;
      if (ts.isIdentifier(node.name)) {
        const varName = node.name.text;
        const resolved = resolveStringNode(init);
        if (resolved !== null) {
          constBindings.set(varName, resolved);
        }
      }
    }
    ts.forEachChild(node, collectBindings);
  }
  collectBindings(sf);

  // --- Helper: resolve a TS node to a normalised URL string, or null ---
  function resolveStringNode(node: ts.Node): string | null {
    if (ts.isStringLiteral(node)) {
      return normalizeUrl(node.text);
    }
    if (ts.isNoSubstitutionTemplateLiteral(node)) {
      return normalizeUrl(node.text);
    }
    if (ts.isTemplateExpression(node)) {
      // head + spans; replace every ${expr} with [param]
      let result = node.head.text;
      for (const span of node.templateSpans) {
        result += "[param]" + span.literal.text;
      }
      return normalizeUrl(result);
    }
    return null;
  }

  function getLine(node: ts.Node): number {
    return sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  }

  // --- Second pass: walk CallExpressions ---
  function walk(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      const args = node.arguments;

      // fetch(url, opts?)
      if (ts.isIdentifier(expr) && expr.text === "fetch" && args.length >= 1) {
        const urlArg = args[0];
        const line = getLine(node);

        let resolvedUrl: string | null = null;

        if (ts.isIdentifier(urlArg)) {
          // identifier — look up const binding
          const bound = constBindings.get(urlArg.text);
          if (bound !== undefined) {
            resolvedUrl = bound;
          } else {
            unresolved.push({
              file: filePath,
              line,
              reason: `fetch URL is identifier '${urlArg.text}' not resolvable to a const string`,
            });
          }
        } else {
          resolvedUrl = resolveStringNode(urlArg);
          if (resolvedUrl === null) {
            unresolved.push({
              file: filePath,
              line,
              reason: `fetch URL arg is not a string/template literal or known identifier (kind: ${ts.SyntaxKind[urlArg.kind]})`,
            });
          }
        }

        if (resolvedUrl !== null && resolvedUrl.startsWith("/api/")) {
          // Extract method from 2nd arg object literal { method: "X" }
          let method = "GET";
          if (args.length >= 2 && ts.isObjectLiteralExpression(args[1])) {
            for (const prop of args[1].properties) {
              if (
                ts.isPropertyAssignment(prop) &&
                ts.isIdentifier(prop.name) &&
                prop.name.text === "method" &&
                ts.isStringLiteral(prop.initializer)
              ) {
                method = prop.initializer.text.toUpperCase();
              }
            }
          }
          calls.push({ url: resolvedUrl, method, file: filePath, line });
        }
      }

      // apiGet(url) / apiPost(url, body) / apiPatch(url, body)
      if (
        ts.isIdentifier(expr) &&
        (expr.text === "apiGet" || expr.text === "apiPost" || expr.text === "apiPatch") &&
        args.length >= 1
      ) {
        const urlArg = args[0];
        const line = getLine(node);
        const methodMap: Record<string, string> = {
          apiGet: "GET",
          apiPost: "POST",
          apiPatch: "PATCH",
        };
        const method = methodMap[expr.text];

        let resolvedUrl: string | null = null;

        if (ts.isIdentifier(urlArg)) {
          const bound = constBindings.get(urlArg.text);
          if (bound !== undefined) {
            resolvedUrl = bound;
          } else {
            unresolved.push({
              file: filePath,
              line,
              reason: `${expr.text} URL is identifier '${urlArg.text}' not resolvable to a const string`,
            });
          }
        } else {
          resolvedUrl = resolveStringNode(urlArg);
          if (resolvedUrl === null) {
            unresolved.push({
              file: filePath,
              line,
              reason: `${expr.text} URL arg is not a string/template literal or known identifier (kind: ${ts.SyntaxKind[urlArg.kind]})`,
            });
          }
        }

        if (resolvedUrl !== null && resolvedUrl.startsWith("/api/")) {
          calls.push({ url: resolvedUrl, method, file: filePath, line });
        }
      }

      // upload(name, body, { handleUploadUrl: "/api/..." })  — @vercel/blob/client
      if (ts.isIdentifier(expr) && expr.text === "upload" && args.length >= 3) {
        const optsArg = args[2];
        const line = getLine(node);
        if (ts.isObjectLiteralExpression(optsArg)) {
          for (const prop of optsArg.properties) {
            if (
              ts.isPropertyAssignment(prop) &&
              ts.isIdentifier(prop.name) &&
              prop.name.text === "handleUploadUrl"
            ) {
              const resolvedUrl = resolveStringNode(prop.initializer);
              if (resolvedUrl === null) {
                // identifier check
                if (ts.isIdentifier(prop.initializer)) {
                  const bound = constBindings.get(prop.initializer.text);
                  if (bound !== undefined) {
                    if (bound.startsWith("/api/")) {
                      calls.push({ url: bound, method: "POST", file: filePath, line });
                    }
                  } else {
                    unresolved.push({
                      file: filePath,
                      line,
                      reason: `upload handleUploadUrl is identifier '${prop.initializer.text}' not resolvable to a const string`,
                    });
                  }
                } else {
                  unresolved.push({
                    file: filePath,
                    line,
                    reason: `upload handleUploadUrl is not a string/template literal or known identifier (kind: ${ts.SyntaxKind[prop.initializer.kind]})`,
                  });
                }
              } else if (resolvedUrl.startsWith("/api/")) {
                calls.push({ url: resolvedUrl, method: "POST", file: filePath, line });
              }
            }
          }
        }
      }
    }

    ts.forEachChild(node, walk);
  }
  walk(sf);

  return { calls, unresolved };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

function matchesRoute(
  call: { url: string; method: string },
  routes: RouteEntry[],
): boolean {
  for (const route of routes) {
    if (route.pattern === call.url && route.methods.has(call.method)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Unit fixture tests (Step 1 + 2)
// ---------------------------------------------------------------------------

describe("extractCalls — unit fixtures", () => {
  it("fetch with explicit DELETE method", () => {
    const src = `fetch("/api/x", { method: "DELETE" });`;
    const { calls, unresolved } = extractCalls("fixture.ts", src);
    expect(unresolved).toHaveLength(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "/api/x", method: "DELETE" });
  });

  it("apiPost maps to POST", () => {
    const src = `apiPost("/api/y", body);`;
    const { calls, unresolved } = extractCalls("fixture.ts", src);
    expect(unresolved).toHaveLength(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "/api/y", method: "POST" });
  });

  it("bare fetch with no method defaults to GET", () => {
    const src = `fetch("/api/z");`;
    const { calls, unresolved } = extractCalls("fixture.ts", src);
    expect(unresolved).toHaveLength(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "/api/z", method: "GET" });
  });

  it("template literal URL is normalised", () => {
    const src = 'fetch(`/api/collections/${c}/items`);';
    const { calls, unresolved } = extractCalls("fixture.ts", src);
    expect(unresolved).toHaveLength(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "/api/collections/[param]/items", method: "GET" });
  });

  it("apiGet with template literal", () => {
    const src = 'apiGet(`/api/collections/${c}/items/${id}`);';
    const { calls, unresolved } = extractCalls("fixture.ts", src);
    expect(unresolved).toHaveLength(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "/api/collections/[param]/items/[param]", method: "GET" });
  });

  it("const-resolution: identifier bound to template literal (ImageViewer pattern)", () => {
    const src = [
      '"use client";',
      'const patchUrl = `/api/collections/${photo.collectionId}/items/${photo.itemId}/photos/${photo.id}`;',
      'await fetch(patchUrl, { method: "PATCH", headers: { "Content-Type": "application/json" } });',
    ].join("\n");
    const { calls, unresolved } = extractCalls("ImageViewer.tsx", src);
    expect(unresolved).toHaveLength(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: "/api/collections/[param]/items/[param]/photos/[param]",
      method: "PATCH",
    });
  });

  it("unresolvable URL arg is reported in unresolved, not silently dropped", () => {
    const src = `fetch(buildUrl(), { method: "POST" });`;
    const { calls, unresolved } = extractCalls("fixture.ts", src);
    expect(calls).toHaveLength(0);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].reason).toMatch(/not a string\/template literal/);
  });

  it("non-/api/ URLs are ignored", () => {
    const src = `fetch("https://example.com/data");`;
    const { calls, unresolved } = extractCalls("fixture.ts", src);
    expect(calls).toHaveLength(0);
    expect(unresolved).toHaveLength(0);
  });

  it("upload() with template handleUploadUrl extracts as POST", () => {
    const src = `upload(name, body, { handleUploadUrl: \`/api/x/\${y}/upload\`, access: "private" });`;
    const { calls, unresolved } = extractCalls("fixture.ts", src);
    expect(unresolved).toHaveLength(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "/api/x/[param]/upload", method: "POST" });
  });

  it("upload() with unresolvable handleUploadUrl goes to unresolved, not silently dropped", () => {
    const src = `upload(name, body, { handleUploadUrl: computeUrl(), access: "private" });`;
    const { calls, unresolved } = extractCalls("fixture.ts", src);
    expect(calls).toHaveLength(0);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].reason).toMatch(/handleUploadUrl/);
  });

  it("query string is stripped during normalisation", () => {
    const src = 'apiGet(`/api/invitations/accept?token=${params.token}`);';
    const { calls } = extractCalls("fixture.ts", src);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/invitations/accept");
  });
});

describe("methodsFromRoute — unit fixtures", () => {
  it("picks up standard export async function declarations", () => {
    const src = `
      export async function GET(req) {}
      export async function POST(req) {}
    `;
    expect(methodsFromRoute(src).sort()).toEqual(["GET", "POST"]);
  });

  it("picks up NextAuth-style re-export: export { handler as GET, handler as POST }", () => {
    const src = `
      const handler = NextAuth(authOptions);
      export { handler as GET, handler as POST };
    `;
    expect(methodsFromRoute(src).sort()).toEqual(["GET", "POST"]);
  });

  it("picks up sync (non-async) function exports", () => {
    const src = `export function DELETE(req) {}`;
    expect(methodsFromRoute(src)).toContain("DELETE");
  });
});

describe("routePatternFromFile — unit fixtures", () => {
  it("converts a route path to a normalised URL pattern", () => {
    const abs = "/repo/src/app/api/collections/[id]/items/route.ts";
    expect(routePatternFromFile(abs)).toBe("/api/collections/[param]/items");
  });

  it("handles deeply nested routes", () => {
    const abs =
      "/repo/src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/set-hero/route.ts";
    expect(routePatternFromFile(abs)).toBe(
      "/api/collections/[param]/items/[param]/photos/[param]/set-hero",
    );
  });
});

// ---------------------------------------------------------------------------
// Guardrail proof (Step 4)
// ---------------------------------------------------------------------------

describe("matchesRoute — guardrail", () => {
  // Hand-crafted route table — self-contained so this test can't become a no-op
  // if someone later adds a real /api/does-not-exist route.
  const FIXED_ROUTES: RouteEntry[] = [
    { pattern: "/api/collections", methods: new Set(["GET", "POST"]) },
    { pattern: "/api/collections/[param]/items", methods: new Set(["GET", "POST"]) },
    { pattern: "/api/collections/[param]/pool/upload", methods: new Set(["POST"]) },
  ];

  it("returns false for a deliberately non-existent route (self-contained)", () => {
    const fakeMiss = matchesRoute(
      { url: "/api/does-not-exist", method: "POST" },
      FIXED_ROUTES,
    );
    expect(fakeMiss).toBe(false);
  });

  it("returns true for a known route in the hand-crafted table", () => {
    const hit = matchesRoute({ url: "/api/collections", method: "POST" }, FIXED_ROUTES);
    expect(hit).toBe(true);
  });

  it("returns true for a real route in the live route table (sanity check)", () => {
    const REPO_ROOT = path.resolve(__dirname, "../../..");
    const routes = buildRouteTable(REPO_ROOT);
    // /api/collections is definitely real
    const hit = matchesRoute({ url: "/api/collections", method: "POST" }, routes);
    expect(hit).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Repo-scan test (Step 3)
// ---------------------------------------------------------------------------

describe("repo-scan: every UI /api/ call matches a route+method", () => {
  const REPO_ROOT = path.resolve(__dirname, "../../..");

  // Walk "use client" files in src/components, src/features, src/app
  // Uses dependency-free recursive walk — no glob dep.
  const USE_CLIENT_RE = /^\s*["']use client["']/;
  function getClientFiles(): string[] {
    const dirs = [
      path.join(REPO_ROOT, "src", "components"),
      path.join(REPO_ROOT, "src", "features"),
      path.join(REPO_ROOT, "src", "app"),
    ];
    const tsExt = /\.(ts|tsx)$/;
    const files = dirs.flatMap((d) => (fs.existsSync(d) ? walkFiles(d, tsExt) : []));
    return files.filter((abs) => {
      // Strip leading BOM (﻿) before testing the directive.
      const content = fs.readFileSync(abs, "utf-8").replace(/^﻿/, "");
      return USE_CLIENT_RE.test(content);
    });
  }

  it("all UI fetch call URLs can be statically resolved (no unresolved sites)", () => {
    const clientFiles = getClientFiles();
    const allUnresolved: UnresolvedCall[] = [];

    for (const file of clientFiles) {
      const src = fs.readFileSync(file, "utf-8");
      const { unresolved } = extractCalls(file, src);
      allUnresolved.push(...unresolved);
    }

    if (allUnresolved.length > 0) {
      const details = allUnresolved
        .map((u) => `  ${u.file}:${u.line} — ${u.reason}`)
        .join("\n");
      throw new Error(
        `${allUnresolved.length} unresolvable UI fetch URL(s) found — annotate or make statically resolvable:\n${details}`,
      );
    }

    expect(allUnresolved).toHaveLength(0);
  });

  it("every extracted UI call targets a real route+method (no dangling wires)", () => {
    const clientFiles = getClientFiles();
    const routes = buildRouteTable(REPO_ROOT);

    const allCalls: ApiCall[] = [];
    for (const file of clientFiles) {
      const src = fs.readFileSync(file, "utf-8");
      const { calls } = extractCalls(file, src);
      allCalls.push(...calls);
    }

    const mismatches: ApiCall[] = allCalls.filter((c) => !matchesRoute(c, routes));

    if (mismatches.length > 0) {
      const details = mismatches
        .map((c) => `  ${c.file}:${c.line} — ${c.method} ${c.url}`)
        .join("\n");
      throw new Error(
        `${mismatches.length} UI call(s) have no matching API route:\n${details}`,
      );
    }

    // Also sanity-check we actually found some calls (guard against an empty scan)
    expect(allCalls.length).toBeGreaterThan(0);
    expect(mismatches).toHaveLength(0);
  });
});
