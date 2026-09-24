import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { brotliCompressSync, createBrotliCompress, constants } from 'node:zlib';
import { chromium, expect } from '@playwright/test';

const [before, after, destination] = process.argv.slice(2);
assert.ok(
	before && after && destination,
	'Usage: route-module-reuse.mjs before-output after-output results.json',
);
const root = new URL('../../../', import.meta.url).pathname;
const compression = { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } };
const receipt = { started: new Date().toISOString(), builds: {}, samples: [], warmups: [] };
const services = [];
const listen = (server) =>
	new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => resolve(server.address().port));
	});
async function serve(label, output) {
	const reservation = createServer();
	const port = await listen(reservation);
	await new Promise((resolve) => reservation.close(resolve));
	const backend = `http://127.0.0.1:${port}`;
	const process = spawn(globalThis.process.execPath, [output + '/server/index.mjs'], {
		cwd: root + '/website',
		env: { ...globalThis.process.env, NITRO_HOST: '127.0.0.1', NITRO_PORT: String(port) },
		stdio: ['ignore', 'ignore', 'pipe'],
	});
	services.push({ process });
	let errors = '';
	process.stderr.on('data', (data) => (errors += data));
	await expect
		.poll(
			async () => {
				assert.equal(process.exitCode, null, errors);
				try {
					return (await fetch(backend + '/markless/theme.js')).status;
				} catch {
					return 0;
				}
			},
			{ timeout: 15000 },
		)
		.toBe(200);
	const files = new Map();
	receipt.builds[label] = { output, files: {} };
	for (const name of await readdir(output + '/public/build')) {
		if (!name.endsWith('.js')) continue;
		const source = await readFile(output + '/public/build/' + name);
		const bytes = brotliCompressSync(source, compression);
		files.set('/markless/build/' + name, bytes);
		receipt.builds[label].files[name] = {
			rawBytes: source.length,
			brotliBytes: bytes.length,
			sha256: createHash('sha256').update(source).digest('hex'),
		};
	}
	const proxy = createServer((incoming, outgoing) => {
		const bytes = files.get(new URL(incoming.url, backend).pathname);
		if (bytes) {
			outgoing.writeHead(200, {
				'content-type': 'text/javascript',
				'content-encoding': 'br',
				'content-length': bytes.length,
				'cache-control': 'no-store',
			});
			outgoing.end(bytes);
			return;
		}
		const upstream = request(
			backend + incoming.url,
			{ method: incoming.method, headers: incoming.headers },
			(response) => {
				const headers = Object.fromEntries(
					Object.entries(response.headers).filter(
						([key]) => !['connection', 'keep-alive', 'transfer-encoding'].includes(key),
					),
				);
				if (
					headers['content-type']?.includes('text/html') &&
					!headers['content-encoding']
				) {
					delete headers['content-length'];
					headers['content-encoding'] = 'br';
					outgoing.writeHead(response.statusCode, headers);
					response.pipe(createBrotliCompress(compression)).pipe(outgoing);
				} else {
					outgoing.writeHead(response.statusCode, headers);
					response.pipe(outgoing);
				}
			},
		);
		upstream.on('error', (error) => {
			outgoing.writeHead(502);
			outgoing.end(String(error));
		});
		incoming.pipe(upstream);
	});
	services.at(-1).proxy = proxy;
	return `http://127.0.0.1:${await listen(proxy)}`;
}
const median = (values) => {
	const sorted = [...values].sort((a, b) => a - b);
	return (
		(sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) /
		2
	);
};
let browser;
try {
	const origins = { before: await serve('before', before), after: await serve('after', after) };
	browser = await chromium.launch({ channel: 'chrome', headless: true });
	receipt.browser = browser.version();
	receipt.method =
		'See ROUTE-MODULE-REUSE.md. Local HTTP/1.1 with identical Brotli JS and streamed HTML. No code instrumentation in timed visits.';
	async function visit(label, kind, mode, profile, iteration, warmup = false) {
		const context = await browser.newContext({
			viewport: { width: 1440, height: 1000 },
			serviceWorkers: 'block',
		});
		const page = await context.newPage(),
			cdp = await context.newCDPSession(page);
		await cdp.send('Network.enable');
		await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile === 'normal' ? 1 : 4 });
		if (profile === 'constrained')
			await cdp.send('Network.emulateNetworkConditions', {
				offline: false,
				latency: 150,
				downloadThroughput: 625000,
				uploadThroughput: 125000,
			});
		const row = { label, kind, mode, profile, iteration, requests: [], errors: [], failed: [] };
		const pending = new Set();
		page.on('pageerror', (error) => row.errors.push(error.message));
		page.on('request', (request) => {
			if (new URL(request.url()).pathname.startsWith('/markless/build/')) {
				pending.add(request);
				row.requests.push(request.url());
			}
		});
		page.on('requestfinished', (request) => pending.delete(request));
		page.on('requestfailed', (request) => {
			pending.delete(request);
			row.failed.push({ url: request.url(), error: request.failure() });
		});
		try {
			await page.addInitScript((kind) => {
				performance.setResourceTimingBufferSize(10000);
				const state = (window.__routeTiming = { actions: [] });
				state.read = () =>
					kind === 'counter'
						? Number(state.target.textContent.match(/\d+/)[0])
						: state.watch.getAttribute('aria-expanded');
				window.addEventListener(
					'click',
					(event) => {
						if (event.isTrusted && state.target?.contains(event.target))
							state.actions.push({ start: performance.now(), before: state.read() });
					},
					true,
				);
			}, kind);
			const path =
				kind === 'accordion' ? '/markless/ui/accordion' : '/markless/concepts/state';
			const response = await page.goto(origins[label] + path, {
				waitUntil: mode === 'early' ? 'commit' : 'load',
				timeout: 30000,
			});
			assert.equal(response.status(), 200);
			if (mode === 'settled') {
				await page.waitForTimeout(500);
				await expect.poll(() => pending.size).toBe(0);
			}
			await page.waitForFunction(
				(kind) => {
					if (!performance.getEntriesByName('first-contentful-paint').length)
						return false;
					const target =
						kind === 'accordion'
							? document.querySelectorAll(
									'.pg[data-family="accordion"] .pg-stage .trigger',
								)[1]
							: [...document.querySelectorAll('button')].find((el) =>
									kind === 'sidebar'
										? el.textContent.trim() === 'Core concepts'
										: kind === 'counter'
											? /^Clicked \d+ times$/.test(el.textContent.trim())
											: el.textContent.trim() ===
												'How do I return something?',
								);
					if (!target) return false;
					let box = target.getBoundingClientRect();
					if (box.top < 0 || box.bottom > innerHeight) {
						target.scrollIntoView({ block: 'center', behavior: 'instant' });
						box = target.getBoundingClientRect();
					}
					const x = box.left + box.width / 2,
						y = box.top + box.height / 2;
					if (
						!box.width ||
						!box.height ||
						!target.contains(document.elementFromPoint(x, y))
					)
						return false;
					const state = window.__routeTiming;
					state.target = target;
					state.watch = kind === 'sidebar' ? target.closest('[role=treeitem]') : target;
					state.point = { x, y };
					state.ready = performance.now();
					new MutationObserver(() => {
						const action = state.actions.find((item) => item.end === undefined),
							value = state.read();
						if (action && value !== action.before) {
							action.end = performance.now();
							action.after = value;
							action.ms = action.end - action.start;
						}
					}).observe(state.watch, {
						subtree: true,
						attributes: true,
						childList: true,
						characterData: true,
					});
					return true;
				},
				kind,
				{ polling: 'raf', timeout: 15000 },
			);
			row.pendingAtFirstClick = pending.size;
			row.requestsBeforeClick = row.requests.length;
			let point = await page.evaluate(() => window.__routeTiming.point);
			for (let index = 0; index < 3; index++) {
				if (index > 0)
					point = await page.evaluate(() => {
						const target = window.__routeTiming.target;
						target.scrollIntoView({ block: 'center', behavior: 'instant' });
						const box = target.getBoundingClientRect();
						return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
					});
				await page.mouse.click(point.x, point.y, { delay: 0 });
				await page.waitForFunction(
					(index) => window.__routeTiming.actions[index]?.end !== undefined,
					index,
					{ timeout: 15000 },
				);
				if (mode === 'settled') await page.waitForTimeout(50);
			}
			row.actions = await page.evaluate(() => window.__routeTiming.actions);
			for (const action of row.actions)
				assert.equal(
					action.after,
					kind === 'counter' ? action.before + 1 : String(action.before !== 'true'),
				);
			if (mode === 'early' && kind === 'counter') {
				for (let index = 0; index < 10; index++)
					await page.mouse.click(point.x, point.y, { delay: 0 });
				await page.waitForFunction(() => window.__routeTiming.read() === 13, null, {
					timeout: 15000,
				});
				row.burstValue = await page.evaluate(() => window.__routeTiming.read());
			}
			row.actionsStartedRequests = row.requests.length - row.requestsBeforeClick;
			await expect.poll(() => pending.size).toBe(0);
			row.frameworkBytes = await page.evaluate(() =>
				performance
					.getEntriesByType('resource')
					.filter((r) => new URL(r.name).pathname.startsWith('/markless/build/'))
					.reduce((sum, r) => sum + r.encodedBodySize, 0),
			);
			assert.equal(row.requests.length, 5);
			if (mode === 'settled') assert.equal(row.actionsStartedRequests, 0);
			assert.deepEqual(row.errors, []);
			assert.deepEqual(row.failed, []);
			row.passed = true;
		} catch (error) {
			row.failure = String(error);
			row.audit = await page.evaluate(() => ({
				actions: window.__routeTiming?.actions,
				value: window.__routeTiming?.target && window.__routeTiming.read(),
				target: window.__routeTiming?.target?.outerHTML,
			}));
			throw error;
		} finally {
			(warmup ? receipt.warmups : receipt.samples).push(row);
			await writeFile(destination, JSON.stringify(receipt, null, 2));
			console.log(
				JSON.stringify({
					label,
					kind,
					mode,
					profile,
					iteration,
					warmup,
					ms: row.actions?.map((a) => a.ms),
					passed: row.passed,
					failure: row.failure,
				}),
			);
			await context.close();
		}
	}
	for (const label of ['before', 'after'])
		await visit(label, 'sidebar', 'settled', 'normal', -1, true);
	for (const mode of ['settled', 'early'])
		for (const profile of mode === 'settled' ? ['normal', 'cpu'] : ['normal', 'constrained'])
			for (const kind of mode === 'settled'
				? ['sidebar', 'counter', 'accordion']
				: ['sidebar', 'counter'])
				for (let iteration = 0; iteration < (mode === 'settled' ? 10 : 5); iteration++)
					for (const label of iteration % 2 ? ['after', 'before'] : ['before', 'after'])
						await visit(label, kind, mode, profile, iteration);
	receipt.summary = [];
	for (const key of new Set(
		receipt.samples.map((row) => [row.mode, row.profile, row.kind].join('/')),
	)) {
		const group = receipt.samples.filter(
			(row) => [row.mode, row.profile, row.kind].join('/') === key,
		);
		const sides = {};
		for (const label of ['before', 'after'])
			sides[label] = [0, 1, 2].map((index) => {
				const values = group
						.filter((row) => row.label === label)
						.map((row) => row.actions[index].ms),
					value = median(values);
				return {
					median: value,
					mad: median(values.map((x) => Math.abs(x - value))),
					min: Math.min(...values),
					max: Math.max(...values),
				};
			});
		receipt.summary.push({
			key,
			...sides,
			changes: [0, 1, 2].map((index) => {
				const before = sides.before[index],
					after = sides.after[index],
					delta = before.median - after.median;
				const threshold = Math.max(
					10,
					before.median * 0.1,
					2 * Math.max(before.mad, after.mad),
				);
				return { delta, threshold, meaningful: Math.abs(delta) > threshold };
			}),
		});
	}
	receipt.finished = new Date().toISOString();
	await writeFile(destination, JSON.stringify(receipt, null, 2));
} finally {
	await browser?.close();
	for (const { process, proxy } of services) {
		proxy?.closeAllConnections();
		if (proxy) await new Promise((resolve) => proxy.close(resolve));
		process.kill('SIGTERM');
	}
}
