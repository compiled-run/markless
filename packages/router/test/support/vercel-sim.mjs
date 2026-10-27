// Serves a Nitro `vercel` build the way Vercel's router does: config.json routes in order, the
// filesystem step for static files, and ISR routes invoked with `x-now-route-matches`, so Nitro's
// own ISR rewrite (which drops the query string) runs exactly as it does on Vercel.
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const output = process.env.VERCEL_OUTPUT;
if (!output) throw new Error('VERCEL_OUTPUT names the .vercel/output directory to serve.');
const config = JSON.parse(await readFile(join(output, 'config.json'), 'utf8'));
const entry = (await import(pathToFileURL(join(output, 'functions/__server.func/index.mjs')).href))
	.default;
const overrides = new Map(
	Object.entries(config.overrides ?? {}).map(([file, { path }]) => [`/${path}`, file]),
);
const types = {
	'.css': 'text/css',
	'.html': 'text/html;charset=utf-8',
	'.js': 'text/javascript',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.txt': 'text/plain',
};

async function staticFile(pathname) {
	for (const name of [decodeURIComponent(pathname).slice(1), overrides.get(pathname)]) {
		if (!name) continue;
		const file = join(output, 'static', name);
		try {
			if ((await stat(file)).isFile()) return file;
		} catch {}
	}
	return undefined;
}

// A `has` condition matches the whole header value, as Vercel's does.
const holds = (condition, req) =>
	condition.type === 'header' &&
	new RegExp(`^(?:${condition.value ?? '.*'})$`).test(req.headers[condition.key.toLowerCase()] ?? '');

async function resolve(url, req) {
	const headers = {};
	for (const route of config.routes) {
		if (route.handle === 'filesystem') {
			const file = await staticFile(url.pathname);
			if (file) return { file, headers };
			continue;
		}
		const match = new RegExp(`^${route.src}$`).exec(url.pathname);
		if (!match || !(route.has ?? []).every((condition) => holds(condition, req))) continue;
		if (route.headers) Object.assign(headers, route.headers);
		if (route.continue) continue;
		if (route.status) return { status: route.status, headers };
		if (!route.dest) {
			const file = await staticFile(url.pathname);
			return file ? { file, headers } : { status: 404, headers };
		}
		const groups = match.groups ?? {};
		const dest = route.dest.replace(/\$(\w+)/g, (_, key) => groups[key] ?? match[key] ?? '');
		const rewritten = await staticFile(dest);
		if (rewritten) return { file: rewritten, headers };
		return { dest, groups, headers };
	}
	return { status: 404, headers };
}

const server = createServer(async (req, res) => {
	const url = new URL(req.url ?? '/', 'http://vercel.test');
	const resolved = await resolve(url, req);
	if (resolved.file)
		res.setHeader('content-type', types[extname(resolved.file)] ?? 'application/octet-stream');
	for (const [name, value] of Object.entries(resolved.headers)) res.setHeader(name, value);
	if (resolved.file) {
		res.end(await readFile(resolved.file));
		return;
	}
	if (!resolved.dest) {
		res.statusCode = resolved.status;
		res.end();
		return;
	}
	const isr = Object.keys(resolved.groups).includes('__isr_route');
	if (isr) {
		req.headers['x-now-route-matches'] = new URLSearchParams(resolved.groups).toString();
		req.url = resolved.dest + (url.search ? `&${url.search.slice(1)}` : '');
	}
	if (typeof entry === 'function') return entry(req, res);
	const headers = new Headers();
	for (const [name, value] of Object.entries(req.headers))
		if (typeof value === 'string') headers.set(name, value);
	const response = await entry.fetch(
		new Request(new URL(req.url, `http://${req.headers.host}`), { method: req.method, headers }),
		{ waitUntil() {} },
	);
	res.statusCode = response.status;
	for (const [name, value] of response.headers) res.appendHeader(name, value);
	if (!response.body) return res.end();
	for await (const chunk of response.body) res.write(chunk);
	res.end();
});
server.listen(Number(process.env.PORT ?? 0), '127.0.0.1', () => {
	console.log(`Listening on: http://127.0.0.1:${server.address().port}`);
});
