// Local host for the Vercel Build Output: static files first, then the edge function (mirrors config.json "handle: filesystem").
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

const root = fileURLToPath(new URL("../.vercel/output/", import.meta.url));
const staticDir = join(root, "static");
const port = Number(process.env.PORT ?? 4425);
const { default: handler } = await import(join(root, "functions/_qwik-router.func/entry.vercel-edge.js"));

const types = {
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".html": "text/html; charset=utf-8",
};

async function serveStatic(pathname, res) {
  const file = normalize(join(staticDir, decodeURIComponent(pathname)));
  if (!file.startsWith(staticDir)) return false;
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return false;
  const immutable = /^\/(assets|build)\//.test(pathname);
  res.writeHead(200, {
    "content-type": types[extname(file)] ?? "application/octet-stream",
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
  });
  res.end(await readFile(file));
  return true;
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (req.method === "GET" && (await serveStatic(url.pathname, res))) return;
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : Readable.toWeb(req);
    const response = await handler(
      new Request(url, { method: req.method, headers: req.headers, body, duplex: "half" }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(res);
    else res.end();
  } catch (error) {
    res.writeHead(500).end(String(error?.stack ?? error));
  }
}).listen(port, () => console.log(`qwik-tuned bench serving on http://localhost:${port}`));
