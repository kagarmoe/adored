/// <reference lib="deno.ns" />
import { extractTargets } from "../models/link_audit.ts";

Deno.test("extractTargets resolves relative hrefs, skips non-http schemes, strips hashes", () => {
  const html = `
    <a href="/collections">x</a>
    <a href='https://ext.example/p#frag'>y</a>
    <a href="mailto:a@b.c">m</a>
    <a href="#top">t</a>
    <form action="/api/go"></form>
    <button formaction="/api/btn">b</button>`;
  const got = extractTargets(html, "https://site.test/home");
  const urls = got.map((t) => `${t.kind}:${t.url}`).sort();
  if (
    JSON.stringify(urls) !== JSON.stringify([
      "button:https://site.test/api/btn",
      "form:https://site.test/api/go",
      "link:https://ext.example/p",
      "link:https://site.test/collections",
    ].sort())
  ) throw new Error(`unexpected targets: ${urls.join(", ")}`);
});