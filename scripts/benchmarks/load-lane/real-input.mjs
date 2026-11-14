// A first press made the way a person makes it, at 6x CPU after idle: mouse (move, down, hold, up), touch (start, hold, end),
// keyboard (Tab to the control, then Enter or Space held), and the instantaneous click and element.click() as the lower bound.
// Times from the release (the moment a person expects the response) to the visible effect; longest main-thread task from a trace.
// Mode early-50: element.click() 50 ms after the load event, throttled from navigation, before the page's idle work has run.
// Modes mid-entry and mid-route, throttled from navigation: a press queued the moment the page asks for the router's resume entry,
// or the moment the route's resume chunk evaluates, timed from that moment; it lands while the start's modules evaluate.
// BROWSER=webkit runs without CPU throttling or traces (WebKit has neither through Playwright) and without touch.
// Usage: node real-input.mjs <built app dir> [runs]   env: PATHNAME, CLICK (control), EFFECT (element whose text changes), MODES, BROWSER
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const playwright = createRequire(resolve(ROOT, 'demos/news/package.json'))('playwright');
const engine = process.env.BROWSER ?? 'chromium';
const chromiumEngine = engine === 'chromium';
const app = resolve(process.argv[2]);
const runs = Number(process.argv[3] ?? 10);
const control = process.env.CLICK ?? 'main > button';
const effect = process.env.EFFECT ?? control;
const modes = (process.env.MODES ?? 'mouse-60,mouse-100,touch-60,touch-100,enter-60,space-60,click,element-click').split(',');

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
const url = `http://127.0.0.1:${port}${process.env.PATHNAME ?? '/'}`;
for (let i = 0; i < 600; i++) {
	if (await fetch(`http://127.0.0.1:${port}/`).then(() => true, () => false)) break;
	await new Promise((r) => setTimeout(r, 100));
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const browser = await playwright[engine].launch();
const results = {};

// Installed before the page's own scripts: queues the press when the start reaches the chosen step.
function queuePressAt([step, selector]) {
	const queue = () => {
		if (window.__queued) return;
		window.__queued = performance.now();
		setTimeout(() => {
			window.__press.up = window.__queued;
			const root = document.querySelector('[data-async-container]');
			window.__press.routeAtUp = window.__routeEvaluated === true;
			window.__press.startedAtUp = !!root?.__asyncResumeRuntimeStarted;
			document.querySelector(selector).click();
		});
	};
	if (step === 'mid-entry')
		Object.defineProperty(Element.prototype, '__mResume', {
			configurable: true,
			get: () => undefined,
			set(value) {
				Object.defineProperty(this, '__mResume', { configurable: true, writable: true, value });
				if (value) queue();
			},
		});
	const packs = {};
	globalThis.__marklessPacks = new Proxy(packs, {
		set(target, key, value) {
			target[key] = value;
			const route = JSON.parse(document.querySelector('script[type="@markless/core/route"]')?.textContent ?? '{}');
			if (route.resume && new URL(route.resume[0], location.href).href === key) {
				window.__routeEvaluated = true;
				if (step === 'mid-route') queue();
			}
			return true;
		},
	});
}

try {
	for (const mode of modes) {
		const samples = [];
		for (let run = 0; run < runs; run++) {
			const touch = mode.startsWith('touch');
			const context = await browser.newContext({ hasTouch: touch, isMobile: false });
			const page = await context.newPage();
			const requests = [];
			const early = mode.startsWith('early');
			const mid = mode.startsWith('mid');
			const fromNavigation = early || mid;
			const cdp = chromiumEngine ? await context.newCDPSession(page) : undefined;
			if (fromNavigation) await cdp?.send('Emulation.setCPUThrottlingRate', { rate: 6 });
			const record = ([effectSelector]) => {
				const target = document.querySelector(effectSelector);
				const record = (window.__press = { before: target.textContent, ...window.__press });
				for (const type of ['pointerup', 'touchend', 'keyup', 'click'])
					addEventListener(type, (event) => {
						if (record.up !== undefined || (type === 'click' && !record.clickOnly)) return;
						record.up = event.timeStamp;
						const root = document.querySelector('[data-async-container]');
						// Whether the press-time resume had already been asked for, and had finished, when the person let go.
						record.wakingAtUp = !!root?.__marklessDelegatedDispatch;
						record.startedAtUp = !!root?.__asyncResumeRuntimeStarted;
						record.modulesAtUp = !!root?.__mResume;
						// Whether the chunk holding the page's own resume module had run, by its route script.
						const route = JSON.parse(document.querySelector('script[type="@markless/core/route"]')?.textContent ?? '{}');
						record.routeAtUp = !!route.resume && new URL(route.resume[0], location.href).href in (globalThis.__marklessPacks ?? {});
					}, { capture: true });
				new MutationObserver(() => {
					if (record.effect === undefined && target.textContent !== record.before) record.effect = performance.now();
				}).observe(target, { subtree: true, characterData: true, childList: true });
			};
			if (mid) {
				await page.addInitScript(queuePressAt, [mode, control]);
				await page.addInitScript(([selector]) => {
					window.__press = {};
					addEventListener('DOMContentLoaded', () => {
						const target = document.querySelector(selector);
						window.__press.before = target.textContent;
						new MutationObserver(() => {
							if (window.__press.effect === undefined && target.textContent !== window.__press.before) window.__press.effect = performance.now();
						}).observe(target, { subtree: true, characterData: true, childList: true });
					});
				}, [effect]);
			}
			await page.goto(url, { waitUntil: 'load' });
			if (fromNavigation) await page.waitForSelector(control);
			else {
				await page.waitForSelector(process.env.READY ?? '[data-list] li');
				// The page's own idle work; an engine with no idle callbacks gets a fixed second.
				await page.evaluate(() => new Promise((done) =>
					typeof requestIdleCallback === 'function' ? requestIdleCallback(() => setTimeout(done, 300), { timeout: 2000 }) : setTimeout(done, 1000)));
			}
			page.on('request', (request) => request.resourceType() === 'script' && requests.push(request.url()));
			if (!fromNavigation) await cdp?.send('Emulation.setCPUThrottlingRate', { rate: 6 });
			if (!mid) await page.evaluate(record, [effect]);
			if (mode === 'click' || mode === 'element-click' || early)
				await page.evaluate(() => (window.__press.clickOnly = true));
			const box = await page.locator(control).first().boundingBox();
			const x = box.x + box.width / 2;
			const y = box.y + box.height / 2;
			if (chromiumEngine) await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] });
			const hold = Number(mode.split('-').at(-1));
			if (mid) {
				// The press was queued by the page's own start; wait for it.
			} else if (mode.startsWith('mouse')) {
				await page.mouse.move(x, y);
				await page.mouse.down();
				await page.waitForTimeout(hold);
				await page.mouse.up();
			} else if (touch) {
				await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
				await page.waitForTimeout(hold);
				await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
			} else if (mode.startsWith('enter') || mode.startsWith('space')) {
				// Focus lands by Tab from the element before the control.
				await page.evaluate((selector) => {
					const target = document.querySelector(selector);
					const all = [...document.querySelectorAll('button, a[href], input')];
					all[all.indexOf(target) - 1]?.focus();
				}, control);
				await page.keyboard.press('Tab');
				const key = mode.startsWith('enter') ? 'Enter' : ' ';
				await page.keyboard.down(key);
				await page.waitForTimeout(hold);
				await page.keyboard.up(key);
			} else if (early)
				await page.evaluate(([selector, after]) => {
					const loaded = performance.getEntriesByType('navigation')[0].loadEventEnd;
					setTimeout(() => document.querySelector(selector).click(), Math.max(0, loaded + after - performance.now()));
				}, [control, Number(mode.split('-').at(-1))]);
			else if (mode === 'click') await page.click(control);
			else await page.evaluate((selector) => document.querySelector(selector).click(), control);
			await page.waitForFunction(() => window.__press.effect !== undefined, null, { timeout: 10000 }).catch(() => {});
			await page.waitForTimeout(300);
			const tasks = [];
			if (chromiumEngine) {
				const trace = JSON.parse((await browser.stopTracing()).toString()).traceEvents;
				const main = new Set(trace.filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map((e) => `${e.pid}:${e.tid}`));
				tasks.push(...trace.filter((e) => e.name === 'RunTask' && e.ph === 'X' && main.has(`${e.pid}:${e.tid}`)));
			}
			const pressed = await page.evaluate(() => window.__press);
			samples.push({
				upToEffect: pressed.effect !== undefined && pressed.up !== undefined ? pressed.effect - pressed.up : null,
				longestTask: Math.max(0, ...tasks.map((task) => task.dur / 1000)),
				scripts: requests.length,
				wakingAtUp: pressed.wakingAtUp,
				startedAtUp: pressed.startedAtUp,
				modulesAtUp: pressed.modulesAtUp,
				routeAtUp: pressed.routeAtUp,
			});
			await context.close();
		}
		const times = samples.map((s) => s.upToEffect ?? Infinity);
		results[mode] = {
			upToEffectMs: median(times),
			worstMs: Math.max(...times),
			longestTaskMs: median(samples.map((s) => s.longestTask)),
			scripts: Math.max(...samples.map((s) => s.scripts)),
			samples,
		};
	}
} finally {
	await browser.close();
	const exited = new Promise((done) => server.once('exit', done));
	server.kill();
	await Promise.race([exited, new Promise((done) => setTimeout(done, 8000))]);
	server.kill('SIGKILL');
}
console.log(JSON.stringify({ app, engine, url, results }, null, 1));
