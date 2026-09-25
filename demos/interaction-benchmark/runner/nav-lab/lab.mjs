// Navigation lab (T158): click-to-destination-paint across entrants in real browsers, through the runner's
// proxy (HTTP/2 + TLS + brotli, shaped listener) with a logging hop that records every request the
// browser makes, speculative ones included. Adapted from the T140 lab: entrants are separate servers
// (one logger + proxy each) and sessions rotate entrant order per repetition.
// usage: node lab.mjs --entrants name=http://127.0.0.1:PORT,... --browsers chromium,webkit
//        --profiles normal,constrained --modes d100,d200,d300,touch --n 5 --out file.jsonl [--journeys 0,1,2]
import fs from 'node:fs';
import http from 'node:http';
import zlib from 'node:zlib';
import { startProxy } from '../proxy.mjs';
import { browserTypes } from '../lib/session.mjs';
import { profiles as PROFILES } from '../lib/profiles.mjs';

const args = Object.fromEntries(
	process.argv
		.slice(2)
		.reduce(
			(acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc),
			[],
		),
);
const entrants = args.entrants.split(',').map((pair) => {
	const at = pair.indexOf('=');
	return { name: pair.slice(0, at), upstream: pair.slice(at + 1) };
});
const browsers = (args.browsers ?? 'chromium').split(',');
const profileNames = (args.profiles ?? 'normal').split(',');
const modes = (args.modes ?? 'd100').split(',');
const n = Number(args.n ?? 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const page = (title, rows) => ({ selector: '[data-testid="page-title"]', text: title, rows });
const JOURNEYS = [
	{
		name: 'J1',
		land: '/',
		steps: [
			{
				link: '[data-testid="nav-records"]',
				to: '/records',
				expect: page('Records', 200),
				decoy: '[data-testid="nav-overview"]',
			},
			{
				link: '[data-testid="nav-settings"]',
				to: '/settings',
				expect: page('Settings'),
				decoy: '[data-testid="nav-records"]',
			},
			{
				link: '[data-testid="nav-overview"]',
				to: '/',
				expect: page('Overview'),
				decoy: '[data-testid="nav-settings"]',
			},
		],
	},
	{
		name: 'J2',
		land: '/',
		steps: [
			{
				link: '[data-testid="nav-settings"]',
				to: '/settings',
				expect: page('Settings'),
				decoy: '[data-testid="nav-records"]',
			},
		],
	},
	{
		name: 'J3',
		land: '/records',
		steps: [],
		wander: ['[data-testid="nav-settings"]', '[data-testid="nav-overview"]'],
	},
	{
		name: 'J4',
		land: '/',
		steps: [
			{
				link: '[data-testid="nav-records"]',
				to: '/records',
				expect: page('Records', 200),
				scrollAfter: 1200,
			},
			{ link: '[data-testid="nav-settings"]', to: '/settings', expect: page('Settings') },
			{ back: true, to: '/records', expect: page('Records', 200) },
		],
	},
];
const journeys = JOURNEYS.filter(
	(_, i) => !args.journeys || args.journeys.split(',').map(Number).includes(i),
);

function startLogger(upstream, log) {
	const target = new URL(upstream);
	const agent = new http.Agent({ keepAlive: true, maxSockets: 256 });
	const brCache = new Map();
	const server = http.createServer((req, res) => {
		const entry = {
			path: req.url,
			method: req.method,
			start: Date.now(),
			end: 0,
			raw: 0,
			type: '',
			frag: req.headers['x-markless-fragment'] ?? '',
			purpose: req.headers['sec-purpose'] ?? '',
		};
		log.push(entry);
		const headers = { ...req.headers, 'accept-encoding': 'identity' };
		const up = http.request(
			{
				hostname: target.hostname,
				port: target.port,
				method: req.method,
				path: req.url,
				headers,
				agent,
			},
			(ur) => {
				entry.type = String(ur.headers['content-type'] ?? '');
				entry.status = ur.statusCode;
				res.writeHead(ur.statusCode ?? 502, ur.headers);
				const chunks = [];
				ur.on('data', (c) => {
					chunks.push(c);
					res.write(c);
				});
				ur.on('end', () => {
					const body = Buffer.concat(chunks);
					entry.raw = body.length;
					entry.end = Date.now();
					const key = `${req.url.split('?')[0]}:${body.length}`;
					const html = entry.type.includes('html');
					if (!html && brCache.has(key)) entry.br = brCache.get(key);
					else {
						entry.br = /text|javascript|json|svg|css/.test(entry.type)
							? zlib.brotliCompressSync(body, {
									params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 },
								}).length
							: body.length;
						if (!html) brCache.set(key, entry.br);
					}
					res.end();
				});
			},
		);
		up.on('error', () => res.destroy());
		req.pipe(up);
	});
	return new Promise((resolve) =>
		server.listen(0, '127.0.0.1', () =>
			resolve({
				url: `http://127.0.0.1:${server.address().port}`,
				close: () => server.close(),
			}),
		),
	);
}

const agentScript = () => {
	const lab = (window.__lab = { over: new Map(), clicks: [] });
	const now = () => performance.timeOrigin + performance.now();
	const stamp = (e) => {
		const t = performance.timeOrigin + e.timeStamp;
		return Math.abs(now() - t) < 10000 ? t : now();
	};
	addEventListener(
		'pointerover',
		(e) => {
			const a = e.target?.closest?.('a[href]');
			if (a && !(e.relatedTarget && a.contains(e.relatedTarget)))
				lab.over.set(a.getAttribute('href'), stamp(e));
		},
		true,
	);
	addEventListener('pointerdown', (e) => (lab.down = stamp(e)), true);
	addEventListener('touchstart', (e) => (lab.down = lab.down ?? stamp(e)), true);
	const watch = () => {
		const want = lab.expect;
		if (!want) return;
		const check = () => {
			if (lab.domAt) return;
			const el = document.querySelector(want.selector);
			if (!el || el.textContent.trim() !== want.text) return;
			if (
				want.rows &&
				document.querySelectorAll('[data-testid="record-row"]').length !== want.rows
			)
				return;
			if (location.pathname !== want.pathname) return;
			lab.domAt = now();
			mo.disconnect();
			requestAnimationFrame(() => requestAnimationFrame(() => (lab.paintAt = now())));
		};
		const mo = new MutationObserver(check);
		mo.observe(document.documentElement, {
			subtree: true,
			childList: true,
			characterData: true,
			attributes: true,
		});
		const poll = () => {
			check();
			if (!lab.domAt) requestAnimationFrame(poll);
		};
		requestAnimationFrame(poll);
	};
	lab.watch = watch;
	addEventListener(
		'click',
		(e) => {
			const a = e.target?.closest?.('a[href]');
			if (!a) return;
			const rec = {
				click: stamp(e),
				over: lab.over.get(a.getAttribute('href')) ?? null,
				down: lab.down ?? null,
				href: a.getAttribute('href'),
			};
			lab.clicks.push(rec);
			watch();
		},
		true,
	);
};

function curvePath(S, T, D, ms) {
	const C = D
		? { x: 2 * D.x - 0.5 * (S.x + T.x), y: 2 * D.y - 0.5 * (S.y + T.y) }
		: { x: (S.x + T.x) / 2 + 20, y: (S.y + T.y) / 2 };
	const steps = Math.max(2, Math.round(ms / 16));
	const pts = [];
	for (let i = 1; i <= steps; i++) {
		const u = i / steps;
		const t = 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5;
		const a = (1 - t) ** 2,
			b = 2 * (1 - t) * t,
			c = t * t;
		pts.push({ x: a * S.x + b * C.x + c * T.x, y: a * S.y + b * C.y + c * T.y });
	}
	return pts;
}

async function moveAlong(pg, pts, box) {
	let overAt = null;
	for (const p of pts) {
		const t = Date.now();
		await pg.mouse.move(p.x, p.y);
		if (
			box &&
			overAt == null &&
			p.x >= box.x &&
			p.x <= box.x + box.width &&
			p.y >= box.y &&
			p.y <= box.y + box.height
		)
			overAt = Date.now();
		const left = 16 - (Date.now() - t);
		if (left > 0) await sleep(left);
	}
	return overAt;
}

async function center(pg, selector) {
	const ok = await pg.evaluate((sel) => {
		const el = [...document.querySelectorAll(sel)].find((x) => {
			const b = x.getBoundingClientRect();
			return b.width > 0 && b.height > 0 && getComputedStyle(x).visibility !== 'hidden';
		});
		if (!el) return false;
		const b0 = el.getBoundingClientRect();
		if (b0.top < 60 || b0.bottom > innerHeight - 20) el.scrollIntoView({ block: 'center' });
		return true;
	}, selector);
	if (!ok) throw new Error(`no visible ${selector}`);
	await sleep(120);
	const box = await pg.evaluate((sel) => {
		const el = [...document.querySelectorAll(sel)].find(
			(x) => x.getBoundingClientRect().width > 0,
		);
		const b = el.getBoundingClientRect();
		return { x: b.x, y: b.y, width: b.width, height: b.height };
	}, selector);
	return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

async function metrics(cdp) {
	if (!cdp) return null;
	const m = Object.fromEntries(
		(await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]),
	);
	return { task: m.TaskDuration * 1000, script: m.ScriptDuration * 1000 };
}
const diff = (a, b) =>
	a && b ? Object.fromEntries(Object.keys(a).map((k) => [k, +(b[k] - a[k]).toFixed(1)])) : null;

async function readNav(pg) {
	return pg.evaluate(() => {
		const lab = window.__lab;
		const click = lab.clicks[lab.clicks.length - 1];
		// Browser-side: anything still arriving after the click and before the destination painted.
		const late = performance
			.getEntriesByType('resource')
			.filter(
				(r) =>
					performance.timeOrigin + r.responseEnd > click.click &&
					performance.timeOrigin + r.startTime < lab.paintAt,
			)
			.map((r) => new URL(r.name).pathname);
		const out = {
			click,
			late,
			clickToDom: lab.domAt - click.click,
			clickToPaint: lab.paintAt - click.click,
			paintEpoch: lab.paintAt,
			lead: click.over ? click.click - click.over : null,
			leadDown: click.down ? click.click - click.down : null,
		};
		lab.domAt = 0;
		lab.paintAt = 0;
		lab.down = undefined;
		lab.over = new Map();
		return out;
	});
}

async function runSession({
	browser,
	browserName,
	profile,
	mode,
	entrant,
	origin,
	journey,
	rep,
	log,
}) {
	const touch = mode === 'touch';
	const ctx = await browser.newContext({
		viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 800 },
		ignoreHTTPSErrors: true,
		hasTouch: touch,
		isMobile: touch && browserName === 'chromium',
		serviceWorkers: 'block',
	});
	await ctx.addInitScript(agentScript);
	const pg = await ctx.newPage();
	const errors = [];
	pg.on('pageerror', (e) => errors.push(String(e.message ?? e).slice(0, 200)));
	pg.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
	let cdp = null;
	if (browserName === 'chromium') {
		cdp = await ctx.newCDPSession(pg);
		await cdp.send('Performance.enable');
		await cdp.send('Profiler.enable');
		await cdp.send('Profiler.startPreciseCoverage', { callCount: false, detailed: false });
		if (profile.cpu.slowdown > 1)
			await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu.slowdown });
	}
	const logStart = log.length;
	const sessionStart = Date.now();
	const rec = {
		sessionStart,
		journey: journey.name,
		entrant: entrant.name,
		browser: browserName,
		profile: profile.name,
		mode,
		rep,
		navs: [],
		errors,
	};
	try {
		await pg.goto(origin + journey.land, { waitUntil: 'load', timeout: 60000 });
		rec.loadEpoch = Date.now();
		await sleep(2000);
		const views = [journey.land];
		if (journey.wander) {
			const vw = pg.viewportSize();
			let from = { x: vw.width - 40, y: vw.height - 40 };
			if (!touch) {
				await pg.mouse.move(from.x, from.y);
				for (const sel of journey.wander) {
					const t = await center(pg, sel);
					const to = { x: t.x - 150, y: Math.min(vw.height - 10, t.y + 260) };
					await moveAlong(pg, curvePath(from, to, { x: t.x, y: t.y }, 520));
					from = to;
					await sleep(300);
				}
			} else if (cdp) {
				const t = await center(pg, journey.wander[0]);
				await cdp.send('Input.dispatchTouchEvent', {
					type: 'touchStart',
					touchPoints: [{ x: t.x, y: t.y }],
				});
				for (let k = 1; k <= 8; k++) {
					await cdp.send('Input.dispatchTouchEvent', {
						type: 'touchMove',
						touchPoints: [{ x: t.x, y: t.y - k * 30 }],
					});
					await sleep(16);
				}
				await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
			}
			await sleep(3000);
		}
		for (const [si, step] of journey.steps.entries()) {
			await pg.evaluate((e) => (window.__lab.expect = e), {
				...step.expect,
				pathname: step.to,
			});
			if (step.back) {
				const m1 = await metrics(cdp);
				await pg.evaluate(() => {
					const lab = window.__lab;
					lab.clicks.push({
						click: performance.timeOrigin + performance.now(),
						over: null,
						down: null,
						href: 'back',
					});
					lab.watch();
					history.back();
				});
				await pg.waitForFunction(() => window.__lab?.paintAt, null, { timeout: 30000 });
				await sleep(200);
				const nav = {
					back: true,
					step: si,
					to: step.to,
					...(await readNav(pg)),
					scrollY: await pg.evaluate(() => scrollY),
				};
				nav.postClick = diff(m1, await metrics(cdp));
				rec.navs.push(nav);
				views.push(step.to);
				continue;
			}
			const target = await center(pg, step.link);
			const decoy = step.decoy ? await center(pg, step.decoy).catch(() => null) : null;
			const m0 = await metrics(cdp);
			if (!touch) {
				const vw = pg.viewportSize();
				const start = {
					x: Math.min(vw.width - 5, Math.max(5, target.x + 180)),
					y: Math.min(vw.height - 5, target.y + 320),
				};
				await pg.mouse.move(start.x, start.y);
				await sleep(50);
				const overAt =
					(await moveAlong(pg, curvePath(start, target, decoy, 520), target.box)) ??
					Date.now();
				const wait = overAt + Number(mode.slice(1)) - Date.now() - 2;
				if (wait > 0) await sleep(wait);
			} else {
				await sleep(50);
			}
			const m1 = await metrics(cdp);
			const clickSent = Date.now();
			if (!touch) {
				await pg.mouse.down();
				await pg.mouse.up();
			} else if (cdp) {
				await cdp.send('Input.dispatchTouchEvent', {
					type: 'touchStart',
					touchPoints: [{ x: target.x, y: target.y }],
				});
				await sleep(100);
				await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
			} else {
				await pg.evaluate(({ x, y }) => {
					const el = document.elementFromPoint(x, y);
					const opts = {
						bubbles: true,
						cancelable: true,
						composed: true,
						clientX: x,
						clientY: y,
						pointerType: 'touch',
						isPrimary: true,
					};
					el.dispatchEvent(new PointerEvent('pointerover', opts));
					el.dispatchEvent(new PointerEvent('pointerdown', opts));
					try {
						el.dispatchEvent(
							new TouchEvent('touchstart', {
								bubbles: true,
								cancelable: true,
								composed: true,
							}),
						);
					} catch {}
				}, target);
				await sleep(100);
				await pg.touchscreen.tap(target.x, target.y);
			}
			await pg.waitForFunction(() => window.__lab?.paintAt, null, { timeout: 30000 });
			await sleep(50);
			const nav = {
				step: si,
				to: step.to,
				clickSentEpoch: clickSent,
				preClick: diff(m0, m1),
				...(await readNav(pg)),
			};
			nav.postClick = diff(m1, await metrics(cdp));
			if (step.scrollAfter) {
				await pg.evaluate((y) => scrollTo(0, y), step.scrollAfter);
				await sleep(300);
			}
			rec.navs.push(nav);
			views.push(step.to);
			if (si < journey.steps.length - 1) {
				await pg.mouse.move(2, 2).catch(() => {});
				await sleep(2000);
			}
		}
		rec.views = views;
		await sleep(1500);
		if (cdp) {
			const cov = await cdp.send('Profiler.takePreciseCoverage');
			rec.evaluated = [
				...new Set(
					cov.result
						.filter(
							(r) =>
								r.url && r.functions.some((f) => f.ranges.some((x) => x.count > 0)),
						)
						.map((r) => new URL(r.url).pathname),
				),
			];
		}
	} catch (error) {
		rec.failure = String(error.message ?? error).slice(0, 300);
		rec.failureState = await pg
			.evaluate(() => ({
				path: location.pathname,
				title: document.querySelector('[data-testid="page-title"]')?.textContent,
			}))
			.catch((e) => String(e));
	}
	rec.requests = log.slice(logStart).map((r) => ({
		path: r.path,
		type: r.type.split(';')[0],
		br: r.br,
		raw: r.raw,
		startEpoch: r.start,
		endEpoch: r.end || null,
		frag: r.frag,
		status: r.status,
	}));
	await ctx.close();
	return rec;
}

// Cold landings, no pointer, until `load`: what each page needs on its own. The analysis counts a
// speculative request as used only when it is in the needed set of a page the session showed, or ran.
async function reference(entrantsUp) {
	const browser = await browserTypes.chromium.launch({
		headless: true,
		args: ['--ignore-certificate-errors'],
	});
	const out = {};
	for (const e of entrantsUp) {
		out[e.name] = {};
		for (const path of ['/', '/records', '/settings']) {
			const ctx = await browser.newContext({
				ignoreHTTPSErrors: true,
				serviceWorkers: 'block',
			});
			const pg = await ctx.newPage();
			const seen = [];
			pg.on('request', (r) => seen.push(new URL(r.url()).pathname));
			await pg.goto(e.origin + path, { waitUntil: 'load' });
			out[e.name][path] = [...new Set(seen)];
			await ctx.close();
		}
	}
	await browser.close();
	return out;
}

const shaped = profileNames
	.filter((p) => p !== 'normal')
	.map((p) => ({ name: p, port: 0, network: PROFILES[p].network }));
const up = [];
for (const e of entrants) {
	const log = [];
	const logger = await startLogger(e.upstream, log);
	const proxy = await startProxy({
		upstream: logger.url,
		port: 20000 + Math.floor(Math.random() * 30000),
		shaped,
	});
	up.push({
		...e,
		log,
		logger,
		proxy,
		origin: proxy.url.replace(/\/$/, ''),
		originFor: (p) => (p === 'normal' ? proxy.url : proxy.shapedUrls[p]).replace(/\/$/, ''),
	});
}
if (args.reference) {
	fs.writeFileSync(args.reference, JSON.stringify(await reference(up), null, 1));
}
const outStream = args.out ? fs.createWriteStream(args.out, { flags: 'a' }) : null;
for (const browserName of browsers) {
	if (!outStream) break;
	const launch = () =>
		browserTypes[browserName].launch({
			headless: true,
			args: browserName === 'chromium' ? ['--ignore-certificate-errors'] : [],
		});
	let browser = await launch();
	for (const pn of profileNames) {
		const profile = {
			name: pn,
			...PROFILES[pn],
			cpu: browserName === 'chromium' ? PROFILES[pn].cpu : { slowdown: 1 },
		};
		for (const mode of modes)
			for (let rep = 0; rep < n; rep++)
				for (const journey of journeys)
					for (let ei = 0; ei < up.length; ei++) {
						const entrant = up[(ei + rep) % up.length];
						// A wedged browser call (seen in WebKit) fails the session and restarts the browser.
						let timer;
						const rec = await Promise.race([
							runSession({
								browser,
								browserName,
								profile,
								mode,
								entrant,
								origin: entrant.originFor(pn),
								journey,
								rep,
								log: entrant.log,
							}),
							new Promise((resolve) => {
								timer = setTimeout(
									() =>
										resolve({
											journey: journey.name,
											entrant: entrant.name,
											browser: browserName,
											profile: pn,
											mode,
											rep,
											navs: [],
											errors: [],
											requests: [],
											failure: 'session watchdog: 150 s',
										}),
									150_000,
								);
							}),
						]);
						clearTimeout(timer);
						if (rec.failure === 'session watchdog: 150 s') {
							await Promise.race([browser.close().catch(() => {}), sleep(10_000)]);
							browser = await launch();
						}
						outStream.write(JSON.stringify(rec) + '\n');
						process.stderr.write(
							`${browserName} ${pn} ${mode} ${entrant.name} ${journey.name} r${rep}: ${rec.failure ?? rec.navs.map((x) => `${x.to} ${x.clickToPaint?.toFixed?.(0)}ms lead ${x.lead?.toFixed?.(0) ?? '-'}`).join(' | ')}\n`,
						);
					}
	}
	await browser.close();
}
outStream?.end();
for (const e of up) {
	await e.proxy.close();
	e.logger.close();
}
process.exit(0);
