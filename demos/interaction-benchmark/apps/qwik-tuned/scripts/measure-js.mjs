// Client JS bytes per route on initial load (gzip level 9 recompression of response bodies, not transfer size).
import { createRequire } from "node:module";
import { realpathSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const repoRoot = new URL("../../../../../", import.meta.url);
const requireFromRoot = createRequire(
  realpathSync(fileURLToPath(new URL("node_modules/@vitest/browser-playwright/package.json", repoRoot))),
);
const { chromium } = requireFromRoot("playwright");
const base = process.env.BASE_URL ?? "http://localhost:4425";
const idleMs = Number(process.env.IDLE_MS ?? 3000);
const staticDir = fileURLToPath(new URL("../.vercel/output/static/", import.meta.url));
const gz = (buf) => gzipSync(buf, { level: 9 }).length;

const browser = await chromium.launch();
const results = {};
for (const path of ["/", "/records", "/settings"]) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const seen = new Map();
  let phase = "load";
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!/\.(js|json)$/.test(url.pathname) || seen.has(url.pathname)) return;
    seen.set(url.pathname, { phase, promise: response.body() });
  });
  const response = await page.goto(new URL(path, base).href, { waitUntil: "load" });
  const html = await response.body();
  phase = "idle";
  await page.waitForTimeout(idleMs);
  const rows = [];
  for (const [file, entry] of seen) {
    const body = await entry.promise.catch(() => Buffer.alloc(0));
    rows.push({ file, phase: entry.phase, gzip: gz(body) });
  }
  await context.close();
  const htmlText = html.toString("utf8");
  const headRefs = [...htmlText.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map((m) => m[1]);
  const sum = (filter) => rows.filter(filter).reduce((n, r) => n + r.gzip, 0);
  results[path] = {
    htmlGzip: gz(html),
    jsModulepreloadedInSsrHead: headRefs.length,
    jsGzipModulepreloadedInSsrHead: sum((r) => headRefs.includes(r.file)),
    jsFilesByLoadEvent: rows.filter((r) => r.phase === "load" && r.file.endsWith(".js")).length,
    jsGzipByLoadEvent: sum((r) => r.phase === "load" && r.file.endsWith(".js")),
    jsFilesByLoadPlusIdle: rows.filter((r) => r.file.endsWith(".js")).length,
    jsGzipByLoadPlusIdle: sum((r) => r.file.endsWith(".js")),
    bundleGraphJsonGzip: sum((r) => r.file.endsWith(".json")),
  };
}
await browser.close();

const buildFiles = readdirSync(`${staticDir}build`).filter((f) => f.endsWith(".js"));
console.log(
  JSON.stringify(
    {
      idleMs,
      routes: results,
      buildDirJsFiles: buildFiles.length,
      buildDirJsGzipTotal: buildFiles.reduce((n, f) => n + gz(readFileSync(`${staticDir}build/${f}`)), 0),
    },
    null,
    2,
  ),
);
