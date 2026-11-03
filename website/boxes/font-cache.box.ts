import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join } from 'node:path';
import { box } from '@async/witness';
import { chromium } from 'playwright-core';

// The brand faces every page paints above the fold; Recursive (code) is left to load on use.
const PRELOADED_FAMILIES = ['Joy Elia', 'Shantell Sans'];
const IMMUTABLE = /max-age=31536000\b.*\bimmutable/;
// What Workers static assets answer for a file no _headers rule names.
const WORKERS_DEFAULT_CACHE = 'public, max-age=0, must-revalidate';

type HeaderRule = { readonly pattern: RegExp; readonly cacheControl: string };

export default box(
	{
		name: 'website fonts: hashed, immutable on Cloudflare, preloaded, and never refetched on reload',
		tags: ['website', 'build', 'browser'],
		modes: ['build'],
	},
	async ({ pipeline, receipt }) => {
		const preset = process.env.NITRO_PRESET;
		process.env.NITRO_PRESET = 'cloudflare-module';
		let root = '';
		try {
			await pipeline.build({
				config: (config) => {
					root = config.root ?? process.cwd();
					return config;
				},
			});
		} finally {
			if (preset === undefined) delete process.env.NITRO_PRESET;
			else process.env.NITRO_PRESET = preset;
		}
		const out = join(root, '.output/public');
		const rules = headerRules(readFileSync(join(out, '_headers'), 'utf8'));
		const cacheControl = (path: string) =>
			rules.findLast((rule) => rule.pattern.test(path))?.cacheControl ?? WORKERS_DEFAULT_CACHE;

		const html = readFileSync(join(out, 'index.html'), 'utf8');
		const css = [
			...[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((match) =>
				readFileSync(join(out, match[1]!), 'utf8'),
			),
			...[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]!),
		].join('\n');
		const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((match) => ({
			family: /font-family:\s*["']?([^"';]+)/.exec(match[1]!)?.[1]?.trim() ?? '',
			urls: [...match[1]!.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((url) => url[1]!),
		}));
		const fontUrls = faces.flatMap((face) => face.urls);
		if (fontUrls.length === 0) throw new Error('The home page carries no @font-face with a url().');
		const mutable = fontUrls.filter((url) => !IMMUTABLE.test(cacheControl(url)));
		if (mutable.length)
			throw new Error(
				`Fonts without long-lived immutable caching revalidate on every reload: ${mutable
					.map((url) => `${url} (${cacheControl(url)})`)
					.join(', ')}`,
			);
		const preloads = [...html.matchAll(/<link rel="preload"[^>]*>/g)].map((match) => match[0]);
		const missing = faces
			.filter((face) => PRELOADED_FAMILIES.includes(face.family))
			.flatMap((face) => face.urls.filter((url) => url.endsWith('.woff2')))
			.filter(
				(url) =>
					!preloads.some(
						(tag) =>
							tag.includes(`href="${url}"`) &&
							tag.includes('as="font"') &&
							tag.includes('crossorigin'),
					),
			);
		if (missing.length)
			throw new Error(`Above-the-fold fonts without a crossorigin font preload: ${missing.join(', ')}`);

		const fetched: string[] = [];
		const server = await serveLikeWorkersAssets(out, cacheControl, (path, status) => {
			if (/\.woff2?$/.test(path)) fetched.push(`${status} ${path}`);
		});
		const browser = await chromium.launch();
		try {
			const page = await browser.newPage();
			const cdp = await page.context().newCDPSession(page);
			// Real round trips: a revalidation that costs nothing on localhost shows as a swap on a live connection.
			await cdp.send('Network.emulateNetworkConditions', {
				offline: false,
				latency: 100,
				downloadThroughput: -1,
				uploadThroughput: -1,
			});
			const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
			await page.goto(`${origin}/`, { waitUntil: 'load' });
			await page.evaluate(() => document.fonts.ready);
			if (fetched.length === 0) throw new Error('The cold load fetched no fonts, so the reload proves nothing.');
			fetched.length = 0;
			await page.reload({ waitUntil: 'load' });
			await page.evaluate(() => document.fonts.ready);
			if (fetched.length)
				throw new Error(`A warm reload went to the network for fonts: ${fetched.join(', ')}`);
		} finally {
			await browser.close();
			await new Promise((done) => server.close(done));
		}
		await receipt.capture('fonts are hashed, immutable, preloaded, and a warm reload reads them from cache');
	},
);

function headerRules(source: string): HeaderRule[] {
	const rules: { pattern: RegExp; cacheControl?: string }[] = [];
	for (const line of source.split('\n')) {
		if (!line.trim()) continue;
		if (!/^\s/.test(line)) {
			const escaped = line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
			rules.push({ pattern: new RegExp(`^${escaped}$`) });
			continue;
		}
		const [name, ...value] = line.trim().split(':');
		if (name!.trim().toLowerCase() === 'cache-control') rules.at(-1)!.cacheControl = value.join(':').trim();
	}
	return rules.filter((rule): rule is HeaderRule => rule.cacheControl !== undefined);
}

const TYPES: Record<string, string> = {
	'.html': 'text/html',
	'.css': 'text/css',
	'.js': 'text/javascript',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.woff2': 'font/woff2',
	'.woff': 'font/woff',
	'.png': 'image/png',
	'.webp': 'image/webp',
};

// Workers static assets: the _headers cache rules, an ETag, and a 304 for a matching If-None-Match.
async function serveLikeWorkersAssets(
	dir: string,
	cacheControl: (path: string) => string,
	served: (path: string, status: number) => void,
): Promise<Server> {
	const server = createServer((req, res) => {
		const path = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname);
		const file = [path, `${path}.html`, join(path, 'index.html')]
			.map((candidate) => join(dir, candidate))
			.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
		if (!file) {
			res.writeHead(404).end();
			return;
		}
		const body = readFileSync(file);
		const etag = `"${createHash('md5').update(body).digest('hex')}"`;
		const headers = {
			'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
			'cache-control': cacheControl(path),
			etag,
		};
		const status = req.headers['if-none-match'] === etag ? 304 : 200;
		served(path, status);
		res.writeHead(status, headers).end(status === 304 ? undefined : body);
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	return server;
}
