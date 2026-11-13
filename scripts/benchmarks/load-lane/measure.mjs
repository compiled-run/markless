// Executed chars at first idle and with the list filled, downloaded gzip, and the first click at 6x CPU throttle,
// for a built router fixture served by its own nitro output. Usage: node measure.mjs <built app dir> [runs]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { openPage } from '../../../demos/interaction-benchmark/runner/lib/controls.mjs';
import {
	executedMask,
	orInto,
	countSet,
	scriptLength,
} from '../../../demos/interaction-benchmark/runner/lib/coverage.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { chromium } = createRequire(resolve(ROOT, 'demos/news/package.json'))('playwright');
const app = resolve(process.argv[2]);
const runs = Number(process.argv[3] ?? 5);
const filledSelector = process.env.FILLED ?? '[data-list] li';
const clickSelector = process.env.CLICK ?? 'main > button';
// The element whose text the click changes; defaults to the clicked element itself.
const effectSelector = process.env.EFFECT ?? clickSelector;

const port = await new Promise((done) => {
	const server = createServer().listen(0, '127.0.0.1', () => {
		const { port } = server.address();
		server.close(() => done(port));
	});
});
const server = spawn(process.execPath, [resolve(app, '.output/server/index.mjs')], {
	env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
	cwd: app,
	stdio: ['ignore', 'ignore', 'inherit'],
});
const origin = `http://127.0.0.1:${port}`;
const url = `${origin}${process.env.PATHNAME ?? '/'}`;
// A signed-in page: LOGIN names a module exporting `login(browser, origin)` that resolves to the session's cookies.
let cookies = [];
for (let i = 0; i < 600; i++) {
	if (await fetch(origin).then(() => true, () => false)) break;
	await new Promise((r) => setTimeout(r, 100));
}

if (process.env.LOGIN) {
	const { login } = await import(resolve(process.env.LOGIN));
	const loginBrowser = await chromium.launch();
	cookies = await login(loginBrowser, origin);
	await loginBrowser.close();
}
const cookieHeader = () => cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');

const masks = (scripts, into = new Map()) => {
	for (const script of scripts) {
		const mask = executedMask(script.functions, scriptLength(script.functions));
		const prior = into.get(script.url);
		if (!prior) into.set(script.url, mask);
		else into.set(script.url, orInto(orInto(new Uint8Array(Math.max(prior.length, mask.length)), prior), mask));
	}
	return into;
};
const total = (map) => [...map.values()].reduce((sum, mask) => sum + countSet(mask), 0);

const browser = await chromium.launch();
const loads = [];
// The longest main-thread task and the busy time in a Chromium trace, from `from` (an event to start at) onwards.
const traceTasks = (buffer, from) => {
	const trace = JSON.parse(buffer.toString()).traceEvents;
	const main = new Set(
		trace
			.filter((event) => event.name === 'thread_name' && event.args?.name === 'CrRendererMain')
			.map((event) => `${event.pid}:${event.tid}`),
	);
	const start = from ? trace.find(from) : undefined;
	const tasks = trace.filter(
		(event) =>
			event.name === 'RunTask' &&
			event.ph === 'X' &&
			main.has(`${event.pid}:${event.tid}`) &&
			(!start || (event.pid === start.pid && event.ts + event.dur >= start.ts)),
	);
	return {
		longestTask: Math.max(0, ...tasks.map((task) => task.dur / 1000)),
		busy: tasks.reduce((sum, task) => sum + task.dur / 1000, 0),
	};
};
const TRACE_CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline'];
try {
	for (let run = 0; run < runs; run++) {
		const page = await openPage(browser, { coverage: true });
		await page.page.context().addCookies(cookies);
		await page.page.addInitScript(() => (Math.random = () => 0.5));
		const bodies = new Map();
		page.page.on('response', async (response) => {
			if (!/\.m?js(\?|$)/.test(response.url())) return;
			const body = await response.body().catch(() => null);
			if (body) bodies.set(response.url(), body);
		});
		// The load's own main-thread tasks, at the same 6x CPU the press is timed at.
		const loadCdp = process.env.LOAD_TASKS ? await page.page.context().newCDPSession(page.page) : undefined;
		await loadCdp?.send('Emulation.setCPUThrottlingRate', { rate: 6 });
		if (loadCdp) await browser.startTracing(page.page, { categories: TRACE_CATEGORIES });
		await page.goto(url);
		await page.idle();
		const loadTasks = loadCdp ? traceTasks(await browser.stopTracing()) : undefined;
		await loadCdp?.send('Emulation.setCPUThrottlingRate', { rate: 1 });
		const idle = masks(await page.coverage.take());
		const idleChars = total(idle);
		const loadJs = [...page.state.js.load];
		const filled = await page.page
			.waitForSelector(filledSelector, { timeout: 10000 })
			.then(() => true, () => false);
		await page.settle();
		await page.idle();
		const all = masks(await page.coverage.take(), new Map(idle));
		const filledChars = total(all);
		const gestureJs = page.state.js.load.length;
		await page.page.click(clickSelector);
		await page.settle();
		await page.idle();
		const gestureChars = total(masks(await page.coverage.take()));
		const gestureScripts = page.state.js.load.length - gestureJs;
		const gzip = loadJs.reduce((sum, src) => sum + (bodies.has(src) ? gzipSync(bodies.get(src)).length : 0), 0);
		const html = await fetch(url, { headers: { cookie: cookieHeader() } }).then((r) => r.text());
		loads.push({
			idleChars,
			filledChars,
			gestureChars,
			gestureScripts,
			loadTasks,
			filled,
			loadScripts: loadJs.length,
			jsGzip: gzip,
			htmlGzip: gzipSync(html).length,
			perScript: [...idle].map(([src, mask]) => [src.replace(url, '/'), countSet(mask)]),
			errors: page.state.errors,
		});
		await page.close();
	}

	const clicks = [];
	for (let run = 0; run < runs; run++) {
		const page = await openPage(browser);
		await page.page.context().addCookies(cookies);
		await page.goto(url);
		await page.page.waitForSelector(filledSelector, { timeout: 10000 }).catch(() => {});
		await page.idle();
		page.state.phase = 'input';
		const cdp = await page.page.context().newCDPSession(page.page);
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
		await page.page.evaluate(([selector, effect]) => {
			const pressed = document.querySelector(selector);
			const target = document.querySelector(effect);
			window.__click = { before: target.textContent };
			new PerformanceObserver((list) => {
				for (const entry of list.getEntries())
					if (entry.name === 'click') window.__click.eventToPaint = entry.duration;
			}).observe({ type: 'event', durationThreshold: 16, buffered: true });
			new PerformanceObserver((list) => {
				for (const entry of list.getEntries())
					window.__click.longest = Math.max(window.__click.longest ?? 0, entry.duration);
			}).observe({ type: 'longtask' });
			pressed.addEventListener('pointerdown', (event) => (window.__click.start = event.timeStamp), { capture: true });
			new MutationObserver(() => {
				if (window.__click.start !== undefined && window.__click.updated === undefined && target.textContent !== window.__click.before)
					window.__click.updated = performance.now() - window.__click.start;
			}).observe(target, { subtree: true, characterData: true, childList: true });
		}, [clickSelector, effectSelector]);
		// Main-thread tasks from the press until the page is quiet again, from Chromium's own trace.
		await browser.startTracing(page.page, { categories: TRACE_CATEGORIES });
		await page.page.click(clickSelector);
		await page.page.waitForFunction(() => window.__click.updated !== undefined, null, { timeout: 10000 }).catch(() => {});
		await page.settle();
		const pressTasks = traceTasks(
			await browser.stopTracing(),
			(event) => event.name === 'EventDispatch' && event.args?.data?.type === 'click',
		);
		const result = await page.page.evaluate(() => window.__click);
		clicks.push({
			...result,
			...pressTasks,
			inputScriptsFetched: page.state.fetched.input.length,
			errors: page.state.errors,
		});
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
		await page.close();
	}
	const lowest = (key) => Math.min(...loads.map((load) => load[key]));
	const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
	console.log(
		JSON.stringify(
			{
				app,
				idleChars: lowest('idleChars'),
				filledChars: lowest('filledChars'),
				firstGestureChars: lowest('gestureChars'),
				loadLongestTaskMsMedian: loads[0].loadTasks ? median(loads.map((l) => l.loadTasks.longestTask)) : undefined,
				loadBusyMsMedian: loads[0].loadTasks ? median(loads.map((l) => l.loadTasks.busy)) : undefined,
				scriptsRequestedAtFirstGesture: Math.max(...loads.map((l) => l.gestureScripts)),
				idleRange: [lowest('idleChars'), Math.max(...loads.map((l) => l.idleChars))],
				filledAll: loads.every((l) => l.filled),
				jsGzipAtLoad: lowest('jsGzip'),
				htmlGzip: lowest('htmlGzip'),
				loadScripts: loads[0].loadScripts,
				perScriptAtIdle: loads[0].perScript,
				click: {
					clickToUpdateMsMedian: median(clicks.map((c) => c.updated ?? Infinity)),
					eventToPaintMsMedian: median(clicks.map((c) => c.eventToPaint ?? 0)),
					longestTaskMsMedian: median(clicks.map((c) => c.longestTask)),
					busyMsMedian: median(clicks.map((c) => c.busy)),
					scriptsFetchedAtClick: Math.max(...clicks.map((c) => c.inputScriptsFetched)),
					runs: clicks.map(({ updated, eventToPaint, longestTask, busy, inputScriptsFetched }) => ({ updated, eventToPaint, longestTask, busy, inputScriptsFetched })),
				},
				errors: [...new Set([...loads, ...clicks].flatMap((l) => l.errors))],
			},
			null,
			1,
		),
	);
} finally {
	await browser.close();
	// A server that shuts down gracefully can outlive this script and hold its ports; wait for it, then force it.
	const exited = new Promise((done) => server.once('exit', done));
	server.kill();
	await Promise.race([exited, new Promise((done) => setTimeout(done, 8000))]);
	server.kill('SIGKILL');
}
