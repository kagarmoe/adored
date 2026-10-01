/**
 * Crawls a site from a base URL and reports every link, form, and
 * button target that fails to resolve.
 *
 * @module
 */
import { z } from "npm:zod@4";

const GlobalArgsSchema = z.object({
  baseUrl: z.string().url().describe("Root URL to crawl, e.g. https://adored.kimberlygarmoe.com"),
  maxPages: z.number().int().positive().default(50).describe("Cap on same-origin pages to crawl"),
  loginPath: z.string().default("/login").describe("Path that marks an auth-gated redirect"),
});
type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

const TargetSchema = z.object({
  url: z.string(),
  foundOn: z.string(),
  kind: z.enum(["link", "form", "button"]),
  status: z.number().nullable(),
  finalUrl: z.string().nullable(),
  verdict: z.enum(["ok", "gated", "broken"]),
  error: z.string().optional(),
});

const AuditSchema = z.object({
  baseUrl: z.string(),
  crawledAt: z.iso.datetime(),
  pagesCrawled: z.number(),
  targetsChecked: z.number(),
  brokenCount: z.number(),
  gatedCount: z.number(),
  broken: z.array(TargetSchema),
  targets: z.array(TargetSchema),
});

/** Pull href/action/formaction targets out of raw HTML. Static markup only. */
export function extractTargets(
  html: string,
  pageUrl: string,
): Array<{ url: string; kind: "link" | "form" | "button" }> {
  // ponytail: regex over markup, not a DOM; JS-driven buttons need a Playwright method
  const patterns: Array<[RegExp, "link" | "form" | "button"]> = [
    [/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi, "link"],
    [/<form\b[^>]*\baction\s*=\s*["']([^"']+)["']/gi, "form"],
    [/<button\b[^>]*\bformaction\s*=\s*["']([^"']+)["']/gi, "button"],
  ];
  const out: Array<{ url: string; kind: "link" | "form" | "button" }> = [];
  for (const [re, kind] of patterns) {
    for (const m of html.matchAll(re)) {
      const raw = m[1].trim();
      if (/^(#|mailto:|tel:|javascript:|data:)/i.test(raw)) continue;
      try {
        const u = new URL(raw, pageUrl);
        u.hash = "";
        out.push({ url: u.toString(), kind });
      } catch {
        // unparseable href is itself a finding; surface as a broken target
        out.push({ url: raw, kind });
      }
    }
  }
  return out;
}

/** Link audit model: crawl a site and record unresolved targets. */
export const model = {
  type: "@kagarmoe/link-audit",
  version: "2026.10.01.1",
  globalArguments: GlobalArgsSchema,
  resources: {
    audit: {
      description: "Crawl result: every target checked and the broken subset",
      schema: AuditSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
  },
  methods: {
    crawl: {
      description: "Crawl same-origin pages from baseUrl and check every link, form, and button target",
      arguments: z.object({}),
      execute: async (
        _args: Record<string, never>,
        context: {
          globalArgs: GlobalArgs;
          signal: AbortSignal;
          logger: { info: (msg: string, props?: Record<string, unknown>) => void };
          writeResource: (
            spec: string,
            name: string,
            data: Record<string, unknown>,
          ) => Promise<{ name: string }>;
        },
      ) => {
        const { baseUrl, maxPages, loginPath } = context.globalArgs;
        const origin = new URL(baseUrl).origin;
        const queue: string[] = [new URL(baseUrl).toString()];
        const crawled = new Set<string>();
        const checked = new Map<string, z.infer<typeof TargetSchema>>();

        const check = async (
          url: string,
          foundOn: string,
          kind: "link" | "form" | "button",
        ) => {
          if (checked.has(url)) return checked.get(url)!;
          const entry: z.infer<typeof TargetSchema> = {
            url, foundOn, kind, status: null, finalUrl: null, verdict: "broken",
          };
          try {
            const res = await fetch(url, {
              redirect: "follow",
              signal: context.signal,
              headers: { "user-agent": "swamp-link-audit/1" },
            });
            entry.status = res.status;
            entry.finalUrl = res.url;
            const gated = new URL(res.url).pathname.startsWith(loginPath) &&
              !new URL(url).pathname.startsWith(loginPath);
            entry.verdict = gated ? "gated" : res.ok ? "ok" : "broken";
            const html = res.ok && !gated && res.url.startsWith(origin) &&
                (res.headers.get("content-type") ?? "").includes("text/html")
              ? await res.text()
              : null;
            await res.body?.cancel().catch(() => {});
            checked.set(url, entry);
            return { ...entry, html };
          } catch (e) {
            entry.error = e instanceof Error ? e.message : String(e);
            checked.set(url, entry);
            return entry;
          }
        };

        while (queue.length && crawled.size < maxPages) {
          const page = queue.shift()!;
          if (crawled.has(page)) continue;
          crawled.add(page);
          const res = await check(page, page, "link");
          // a gated redirect lands on a public page (login) worth crawling too
          if (res.verdict === "gated" && res.finalUrl?.startsWith(origin)) {
            queue.push(new URL(res.finalUrl).toString());
          }
          const html = "html" in res ? res.html : null;
          if (!html) continue;
          context.logger.info("crawled {page}", { page });
          for (const t of extractTargets(html, page)) {
            if (t.url.startsWith(origin) && !crawled.has(t.url)) queue.push(t.url);
            else await check(t.url, page, t.kind);
          }
        }
        // targets still queued past maxPages get a status check without a crawl
        for (const url of queue) if (!checked.has(url)) await check(url, baseUrl, "link");

        const targets = [...checked.values()];
        const broken = targets.filter((t) => t.verdict === "broken");
        const handle = await context.writeResource(
          "audit",
          `audit-${new URL(baseUrl).host}`,
          {
            baseUrl,
            crawledAt: new Date().toISOString(),
            pagesCrawled: crawled.size,
            targetsChecked: targets.length,
            brokenCount: broken.length,
            gatedCount: targets.filter((t) => t.verdict === "gated").length,
            broken,
            targets,
          },
        );
        return { dataHandles: [handle] };
      },
    },
  },
};
