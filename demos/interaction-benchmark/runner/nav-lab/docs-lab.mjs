// Docs-site navigation (T158): sidebar-link click to destination paint, for a build whose Links load
// documents (before) and one whose Links swap fragments (after). Also records, per navigation: whether a
// document request happened, layout-shift outside recent input, how far the sidebar and outline moved,
// and the head the page ended with. Journeys follow T140's docs sessions (two sidebar hops each).
// usage: node docs-lab.mjs --entrants before=http://127.0.0.1:P,after=http://127.0.0.1:Q
//        --browsers chromium,webkit --profiles normal,constrained --modes d100,d300,touch --n 1 --out f.jsonl
import fs from 'node:fs';
import http from 'node:http';
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
const modes = (args.modes ?? 'd300').split(',');
const n = Number(args.n ?? 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SESSIONS = [
	['/markless/concepts/state', '/markless/concepts/computed', '/markless/concepts/events'],
	['/markless/concepts/lists', '/markless/concepts/async', '/markless/concepts/styling'],
	['/markless/router/pages', '/markless/router/links', '/markless/router/data'],
	['/markless/build/components', '/markless/build/elements', '/markless/build/storage'],
	['/markless/start/first-app', '/markless/start/reading-tsrx', '/markless'],
];

function startLogger(upstream, log) {
	const target = new URL(upstream);
	const agent = new http.Agent({ keepAlive: true, maxSockets: 256 });
	const server = http.createServer((req, res) => {
		const entry = {
			path: req.url,
			start: Date.now(),
			end: 0,
			raw: 0,
			type: '',
			frag: req.headers['x-markless-fragment'] ?? '',
			dest: req.headers['sec-fetch-dest'] ?? '',
		};
		log.push(entry);
		const up = http.request(
			{
				hostname: target.hostname,
				port: target.port,
				method: req.method,
				path: req.url,
				headers: { ...req.headers, 'accept-encoding': 'identity' },
				agent,
			},
			(ur) => {
				entry.type = String(ur.headers['content-type'] ?? '');
				res.writeHead(ur.statusCode ?? 502, ur.headers);
				ur.on('data', (c) => {
					entry.raw += c.length;
					res.write(c);
				});
				ur.on('end', () => {
					entry.end = Date.now();
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

// Survives only same-document navigations: a document load starts it over.
const agent = () => {
	const lab = (window.__docs = { shifts: [], clicks: [] });
	try {
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries())
				lab.shifts.push({
					value: entry.value,
					recent: entry.hadRecentInput,
					at: performance.timeOrigin + entry.startTime,
				});
		}).observe({ type: 'layout-shift', buffered: true });
	} catch {}
	addEventListener(
		'pointerover',
		(e) => {
			const a = e.target?.closest?.('a[href]');
			if (a) lab.over = performance.timeOrigin + performance.now();
		},
		true,
	);
	addEventListener(
		'click',
		(e) => {
			const a = e.target?.closest?.('a[href]');
			if (!a) return;
			const rec = {
				click: performance.timeOrigin + performance.now(),
				href: a.getAttribute('href'),
			};
			try {
				sessionStorage.setItem('docsClick', JSON.stringify(rec));
			} catch {}
			lab.clicks.push(rec);
			const path = new URL(a.href).pathname;
			lab.paintAt = 0;
			const poll = () => {
				const canonical =
					document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '';
				if (location.pathname === path && canonical.endsWith(path)) {
					requestAnimationFrame(() =>
						requestAnimationFrame(
							() => (lab.paintAt = performance.timeOrigin + performance.now()),
						),
					);
					return;
				}
				requestAnimationFrame(poll);
			};
			requestAnimationFrame(poll);
		},
		true,
	);
};

const chrome = () => {
	const box = (selector) => {
		const el = document.querySelector(selector);
		if (!el) return null;
		const b = el.getBoundingClientRect();
		return {
			x: Math.round(b.x),
			y: Math.round(b.y),
			w: Math.round(b.width),
			h: Math.round(b.height),
			scrollTop: el.scrollTop,
		};
	};
	return {
		sidebar: box('nav.sidebar'),
		outline: box('.on-this-page'),
		title: document.title,
		canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
		crumb: document.querySelector('.crumb-page')?.textContent ?? null,
		h1: document.querySelector('h1')?.textContent ?? null,
		descriptions: document.querySelectorAll('meta[name="description"]').length,
	};
};

async function runSession({
	browser,
	browserName,
	profile,
	mode,
	entrant,
	origin,
	pages,
	rep,
	log,
}) {
	const touch = mode === 'touch';
	const ctx = await browser.newContext({
		viewport: { width: 1280, height: 800 },
		ignoreHTTPSErrors: true,
		hasTouch: touch,
		serviceWorkers: 'block',
	});
	await ctx.addInitScript(agent);
	const pg = await ctx.newPage();
	const errors = [];
	pg.on('pageerror', (e) => errors.push(String(e.message ?? e).slice(0, 200)));
	let cdp = null;
	if (browserName === 'chromium') {
		cdp = await ctx.newCDPSession(pg);
		if (profile.cpu.slowdown > 1)
			await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu.slowdown });
	}
	const logStart = log.length;
	const rec = {
		entrant: entrant.name,
		browser: browserName,
		profile: profile.name,
		mode,
		rep,
		land: pages[0],
		navs: [],
		errors,
	};
	try {
		await pg.goto(origin + pages[0], { waitUntil: 'load', timeout: 60000 });
		await pg.evaluate(() => (window.__sameDocument = 1));
		await sleep(2000);
		for (const [index, to] of pages.slice(1).entries()) {
			const selector = `a[data-markless-router-link][href="${to}"]`;
			const before = await pg.evaluate(chrome);
			const target = await pg.evaluate((sel) => {
				const el = [...document.querySelectorAll(sel)].find(
					(x) => x.getBoundingClientRect().width > 0,
				);
				if (!el) return null;
				el.scrollIntoView({ block: 'nearest' });
				const b = el.getBoundingClientRect();
				return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
			}, selector);
			if (!target) throw new Error(`no visible ${selector}`);
			await sleep(150);
			const scrolledBefore = await pg.evaluate(chrome);
			const logAtClick = log.length;
			if (touch) {
				if (cdp) {
					await cdp.send('Input.dispatchTouchEvent', {
						type: 'touchStart',
						touchPoints: [{ x: target.x, y: target.y }],
					});
					await sleep(100);
					await cdp.send('Input.dispatchTouchEvent', {
						type: 'touchEnd',
						touchPoints: [],
					});
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
			} else {
				await pg.mouse.move(target.x + 120, target.y + 200);
				await sleep(50);
				const steps = 20;
				for (let s = 1; s <= steps; s++) {
					const u = s / steps;
					const t = 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5;
					await pg.mouse.move(target.x + 120 * (1 - t), target.y + 200 * (1 - t));
					await sleep(16);
				}
				await sleep(Number(mode.slice(1)));
				await pg.mouse.down();
				await pg.mouse.up();
			}
			await pg.waitForURL((u) => u.pathname === to, { timeout: 30000 });
			const title = await pg.evaluate(
				async ({ to }) => {
					const start = performance.now();
					while (performance.now() - start < 20000) {
						const link =
							document.querySelector('link[rel="canonical"]')?.getAttribute('href') ??
							'';
						if (
							location.pathname === to &&
							link.endsWith(to) &&
							document.readyState !== 'loading'
						)
							break;
						await new Promise((r) => setTimeout(r, 10));
					}
					await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
					return document.title;
				},
				{ to },
			);
			await sleep(700);
			const nav = await pg.evaluate(() => {
				const same = window.__sameDocument === 1;
				const click = same
					? window.__docs.clicks.at(-1)
					: JSON.parse(sessionStorage.getItem('docsClick') || 'null');
				const fcp = performance
					.getEntriesByType('paint')
					.find((p) => p.name === 'first-contentful-paint');
				return {
					same,
					click,
					fcpEpoch: fcp ? performance.timeOrigin + fcp.startTime : null,
					shifts: window.__docs.shifts,
				};
			});
			// Same-document swaps: the paint is the second frame after the destination's canonical landed.
			const paintEpoch = nav.same
				? await pg.evaluate(() => window.__docs.paintAt || null)
				: nav.fcpEpoch;
			const after = await pg.evaluate(chrome);
			const docRequests = log
				.slice(logAtClick)
				.filter((r) => r.type.includes('html') && !r.frag)
				.map((r) => r.path);
			rec.navs.push({
				to,
				index,
				same: nav.same,
				title,
				docRequests,
				fragmentRequests: log
					.slice(logAtClick)
					.filter((r) => r.frag)
					.map((r) => r.path),
				clickEpoch: nav.click?.click ?? null,
				paintEpoch,
				cls: nav.same
					? nav.shifts
							.filter((s) => !s.recent && s.at >= (nav.click?.click ?? 0))
							.reduce((a, s) => a + s.value, 0)
					: null,
				rawShift: nav.same
					? nav.shifts
							.filter((s) => s.at >= (nav.click?.click ?? 0))
							.reduce((a, s) => a + s.value, 0)
					: null,
				before: scrolledBefore,
				after,
				initial: before,
			});
		}
		// Back to the landing and forward again: same document, head and scroll.
		await pg.evaluate(() => scrollTo(0, 600));
		await sleep(300);
		const scrolled = await pg.evaluate(() => scrollY);
		await pg.goBack();
		await pg.waitForURL((u) => u.pathname === pages[pages.length - 2], { timeout: 30000 });
		await sleep(800);
		rec.back = {
			same: await pg.evaluate(() => window.__sameDocument === 1),
			chrome: await pg.evaluate(chrome),
		};
		await pg.goForward();
		await pg.waitForURL((u) => u.pathname === pages[pages.length - 1], { timeout: 30000 });
		await sleep(800);
		rec.forward = {
			same: await pg.evaluate(() => window.__sameDocument === 1),
			scrollY: await pg.evaluate(() => scrollY),
			expected: scrolled,
			chrome: await pg.evaluate(chrome),
		};
	} catch (error) {
		rec.failure = String(error.message ?? error).slice(0, 300);
	}
	rec.requests = log.slice(logStart).map((r) => ({
		path: r.path,
		type: r.type.split(';')[0],
		raw: r.raw,
		start: r.start,
		end: r.end,
		frag: r.frag,
	}));
	await ctx.close();
	return rec;
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
		originFor: (p) => (p === 'normal' ? proxy.url : proxy.shapedUrls[p]).replace(/\/$/, ''),
	});
}
const out = fs.createWriteStream(args.out, { flags: 'a' });
for (const browserName of browsers) {
	const browser = await browserTypes[browserName].launch({
		headless: true,
		args: browserName === 'chromium' ? ['--ignore-certificate-errors'] : [],
	});
	for (const pn of profileNames) {
		const profile = {
			name: pn,
			...PROFILES[pn],
			cpu: browserName === 'chromium' ? PROFILES[pn].cpu : { slowdown: 1 },
		};
		for (const mode of modes)
			for (let rep = 0; rep < n; rep++)
				for (const pages of SESSIONS)
					for (let ei = 0; ei < up.length; ei++) {
						const entrant = up[(ei + rep) % up.length];
						const rec = await runSession({
							browser,
							browserName,
							profile,
							mode,
							entrant,
							origin: entrant.originFor(pn),
							pages,
							rep,
							log: entrant.log,
						});
						out.write(JSON.stringify(rec) + '\n');
						process.stderr.write(
							`${browserName} ${pn} ${mode} ${entrant.name} ${pages[0]}: ${rec.failure ?? rec.navs.map((x) => `${x.to.split('/').pop()} ${x.paintEpoch && x.clickEpoch ? Math.round(x.paintEpoch - x.clickEpoch) : '?'}ms same=${x.same} cls=${x.cls?.toFixed?.(3) ?? '-'}`).join(' | ')}\n`,
						);
					}
	}
	await browser.close();
}
out.end();
for (const e of up) {
	await e.proxy.close();
	e.logger.close();
}
process.exit(0);
