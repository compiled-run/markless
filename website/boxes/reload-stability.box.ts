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

// Per frame after first paint: the width the scrollbar takes from the page, and every layout shift not caused by input.
const RELOAD_TRACE = `{
	const trace = { gutters: [], shifts: 0 };
	window.reloadTrace = trace;
	new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) if (!entry.hadRecentInput) trace.shifts += entry.value;
	}).observe({ type: 'layout-shift', buffered: true });
	const frame = () => {
		const gutter = document.body ? Math.round(innerWidth - document.body.getBoundingClientRect().width) : 0;
		const painted = document.body && performance.getEntriesByName('first-paint').length > 0;
		if (painted && !trace.gutters.includes(gutter)) trace.gutters.push(gutter);
		if (document.readyState !== 'complete' || performance.now() < 2000) requestAnimationFrame(frame);
	};
	requestAnimationFrame(frame);
}`;

type HeaderRule = { readonly pattern: RegExp; readonly cacheControl: string };

export default box(
	{
		name: 'website reload: fonts stay cached and preloaded, and nothing moves after first paint',
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
		// Headless Chromium hides scrollbars by default, which would hide the gutter this box checks.
		const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
		try {
			const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
			// A string, so the box's own transform adds no helpers the page does not have.
			await page.addInitScript(RELOAD_TRACE);
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
			await page.waitForFunction(() => performance.now() > 2000);
			const trace = (await page.evaluate('window.reloadTrace')) as { gutters: number[]; shifts: number };
			// The parser paints the top of a long page before the rest arrives, so the scrollbar must not move the layout when it does.
			if (trace.gutters.length !== 1)
				throw new Error(`The scrollbar gutter changed width across reload frames: ${trace.gutters.join(' -> ')} px`);
			if (trace.shifts > 0) throw new Error(`The warm reload shifted layout after first paint (CLS ${trace.shifts.toFixed(4)}).`);
		} finally {
			await browser.close();
			await new Promise((done) => server.close(done));
		}
		await receipt.capture('fonts are hashed, immutable and preloaded; a warm reload reads them from cache and shifts nothing');
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

// Workers static assets: the _headers cache rules, and a 304 for an asset's matching If-None-Match.
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
		const html = extname(file) === '.html';
		// Live markless.dev sends prerendered pages without an ETag, so every reload downloads the page again.
		const headers = {
			'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
			'cache-control': cacheControl(path),
			...(html ? {} : { etag }),
		};
		const status = !html && req.headers['if-none-match'] === etag ? 304 : 200;
		served(path, status);
		res.writeHead(status, headers);
		if (status === 304) return void res.end();
		// A page arrives in pieces on a real connection: hold the rest back once the first screen is sent, so the parser paints a partial page.
		const firstScreen = html ? body.indexOf('</p>', body.indexOf('<main')) : -1;
		if (firstScreen < 0) return void res.end(body);
		res.write(body.subarray(0, firstScreen));
		setTimeout(() => res.end(body.subarray(firstScreen)), 400);
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	return server;
}
