// Gzip-9 bytes of the client JS and CSS each route's SSR HTML references on initial load.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const base = process.env.BASE_URL ?? "http://localhost:4440";
const clientDir = new URL("../build/client", import.meta.url).pathname;
const gz = (buf) => gzipSync(buf, { level: 9 }).length;

for (const path of ["/", "/records", "/settings"]) {
  const html = await (await fetch(base + path)).text();
  const js = new Set();
  for (const m of html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)) js.add(m[1]);
  for (const m of html.matchAll(/import\s*(?:\*\s*as\s*\w+\s*from\s*)?"(\/assets\/[^"]+\.js)"/g)) js.add(m[1]);
  const css = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
  const size = (files) =>
    [...files].reduce((acc, f) => {
      const buf = readFileSync(clientDir + f);
      return { raw: acc.raw + buf.length, gzip: acc.gzip + gz(buf) };
    }, { raw: 0, gzip: 0 });
  const j = size(js);
  const c = size(css);
  console.log(JSON.stringify({ path, jsFiles: js.size, jsRaw: j.raw, jsGzip: j.gzip, cssRaw: c.raw, cssGzip: c.gzip, htmlRaw: Buffer.byteLength(html), htmlGzip: gz(Buffer.from(html)) }));
}
