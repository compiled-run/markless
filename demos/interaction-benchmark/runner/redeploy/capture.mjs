// Serves one built entrant and records, per route, every same-origin JS/CSS/font asset a fresh visitor
// fetches: before the load event (landing), until the network has been idle 1.5 s (idle: prefetches),
// during the route's interactions, and on navigation to the other two routes. Optionally probes a list
// of URLs from a previous deploy.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { apps, appsDir } from './apps.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

export const ROUTES = ['/', '/records', '/settings'];
const NAV = { '/': 'nav-overview', '/records': 'nav-records', '/settings': 'nav-settings' };
const tid = (id) => `[data-testid="${id}"]`;

export function sizes(buf) {
	return {
		sha: createHash('sha256').update(buf).digest('hex'),
		raw: buf.length,
		gz: gzipSync(buf, { level: 9 }).length,
		br: brotliCompressSync(buf, {
			params: {
				[constants.BROTLI_PARAM_QUALITY]: 11,
				[constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
			},
		}).length,
	};
}

const isAsset = (url, type) => {
	if (url.pathname.startsWith('/api/')) return false;
	if (/favicon/.test(url.pathname)) return false;
	return (
		['script', 'stylesheet', 'font'].includes(type) ||
		/\.(m?js|css|woff2?|wasm)$/.test(url.pathname)
	);
};

async function interact(page, route) {
	const step = async (fn) => {
		try {
			await fn();
		} catch {}
	};
	const t = { timeout: 3000 };
	if (route === '/') {
		await step(() => page.click(tid('counter-increment'), t));
		await step(() => page.click(tid('stepper-increment'), t));
		await step(async () => {
			await page.focus(tid('toggle-button'), t);
			await page.keyboard.press('Space');
		});
		await step(() => page.click(tid('disclosure-guides'), t));
		await step(() => page.click(tid('disclosure-advanced'), t));
		await step(() => page.click(tid('tab-activity'), t));
		await step(async () => {
			await page.click(tid('filter-input'), t);
			await page.keyboard.insertText('berry');
		});
	} else if (route === '/records') {
		await step(() => page.click(tid('sort-score'), t));
		await step(() =>
			page.click(`[data-testid="record-row"][data-id="r003"] ${tid('record-select')}`, t),
		);
		await step(async () => {
			await page.click(`[data-testid="record-row"][data-id="r001"] ${tid('record-edit')}`, t);
			await page.waitForTimeout(200);
			await page.keyboard.press('Escape');
		});
		await step(async () => {
			await page.click(tid('records-search'), t);
			await page.keyboard.insertText('knuth');
		});
	} else {
		await step(async () => {
			await page.click(tid('settings-quantity'), t);
			await page.keyboard.press('ControlOrMeta+a');
			await page.keyboard.insertText('3');
		});
		await step(() => page.click('.t180-badge', { timeout: 300 }));
		await step(() => page.click(tid('settings-submit'), t));
		await page.waitForTimeout(800);
	}
}

async function waitQuiet(page) {
	try {
		await page.waitForLoadState('networkidle', { timeout: 10000 });
	} catch {}
	await page.waitForTimeout(1500);
}

export async function startServer(name, port) {
	const dir = join(appsDir, name);
	const { command, args, env } = apps[name].serve(port);
	const logPath = `/private/tmp/t180/logs/serve-${name}-${port}.log`;
	const fd = openSync(logPath, 'w');
	const child = spawn(command, args, {
		cwd: dir,
		env: { ...process.env, ...env },
		stdio: ['ignore', fd, fd],
		detached: true,
	});
	closeSync(fd);
	let exited = null;
	child.on('exit', (code) => (exited = code ?? 'signal'));
	const base = `http://127.0.0.1:${port}`;
	const deadline = Date.now() + 90000;
	while (Date.now() < deadline) {
		if (exited !== null)
			throw new Error(`${name} server exited: ${readFileSync(logPath, 'utf8').slice(-800)}`);
		try {
			const res = await fetch(base + '/', { signal: AbortSignal.timeout(3000) });
			await res.arrayBuffer();
			if (res.status < 500) break;
		} catch {}
		await new Promise((r) => setTimeout(r, 250));
	}
	const stop = async () => {
		if (exited !== null) return;
		try {
			process.kill(-child.pid, 'SIGTERM');
		} catch {}
		for (let i = 0; i < 30 && exited === null; i++)
			await new Promise((r) => setTimeout(r, 100));
		if (exited === null)
			try {
				process.kill(-child.pid, 'SIGKILL');
			} catch {}
	};
	return { base, stop };
}

export async function captureApp(name, { probeUrls = [] } = {}) {
	const port = 20000 + Math.floor(Math.random() * 30000);
	const { base, stop } = await startServer(name, port);
	const browser = await chromium.launch({ headless: true });
	const bodies = new Map();
	const routes = {};
	const navigation = {};
	const errors = [];
	try {
		for (const route of ROUTES) {
			const context = await browser.newContext();
			const page = await context.newPage();
			const seen = new Map();
			let phase = 'landing';
			let navDocuments = 0;
			page.on('request', (req) => {
				if (phase === 'nav' && req.resourceType() === 'document') navDocuments++;
			});
			const pending = [];
			page.on('pageerror', (e) =>
				errors.push(`${route} pageerror ${String(e.message).slice(0, 200)}`),
			);
			page.on('response', (res) => {
				const url = new URL(res.url());
				if (url.host !== `127.0.0.1:${port}` || !isAsset(url, res.request().resourceType()))
					return;
				const key = url.pathname + url.search;
				if (!seen.has(key))
					seen.set(key, {
						phase,
						status: res.status(),
						cacheControl: res.headers()['cache-control'] ?? null,
						type: res.request().resourceType(),
					});
				pending.push(
					res.body().then(
						(b) => bodies.set(key, b),
						() => {},
					),
				);
			});
			const res = await page.goto(base + route, { waitUntil: 'load' });
			if (!res || res.status() >= 400)
				throw new Error(`${name} ${route} -> ${res?.status()}`);
			phase = 'idle';
			await waitQuiet(page);
			phase = 'interact';
			await interact(page, route);
			await waitQuiet(page);
			phase = 'nav';
			for (const other of ROUTES.filter((r) => r !== route)) {
				try {
					await page.click(tid(NAV[other]), { timeout: 3000 });
					await page.waitForURL((u) => u.pathname === other, { timeout: 10000 });
				} catch (e) {
					errors.push(`${route} nav ${other}: ${String(e.message).slice(0, 120)}`);
				}
				await waitQuiet(page);
			}
			await Promise.all(pending);
			routes[route] = Object.fromEntries([...seen].sort(([a], [b]) => a.localeCompare(b)));
			navigation[route] = { documents: navDocuments };
			await context.close();
		}
		const assets = {};
		for (const key of new Set(Object.values(routes).flatMap((r) => Object.keys(r)))) {
			let buf = bodies.get(key);
			if (!buf) {
				const r = await fetch(base + key);
				buf = Buffer.from(await r.arrayBuffer());
			}
			assets[key] = sizes(buf);
		}
		const probe = {};
		for (const key of probeUrls) {
			try {
				const r = await fetch(base + key, { signal: AbortSignal.timeout(10000) });
				const buf = Buffer.from(await r.arrayBuffer());
				const ct = r.headers.get('content-type') ?? '';
				probe[key] = {
					status: r.status,
					html: /html/.test(ct),
					sha: createHash('sha256').update(buf).digest('hex'),
				};
			} catch (e) {
				probe[key] = { status: 0, error: String(e.message) };
			}
		}
		return { routes, navigation, assets, probe, errors };
	} finally {
		await browser.close();
		await stop();
	}
}
