// Temporary: per-load function coverage of G16's load window on the bench site, to find what flips on CI.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { openPage } from '../../demos/interaction-benchmark/runner/lib/controls.mjs';
import { executedMask, scriptLength } from '../../demos/interaction-benchmark/runner/lib/coverage.mjs';
import { startTarget } from '../../demos/interaction-benchmark/runner/lib/serve.mjs';
import { BENCH_APP_DIR, PORTS, SITES } from '../benchmarks/perf-guards/config.mjs';
import { buildSite } from '../benchmarks/perf-guards/measure.mjs';

const require = createRequire(import.meta.url);
const RUNS = Number(process.env.G16_RUNS ?? 15);
const OUT = process.env.G16_OUT ?? '/tmp/g16-diagnose';
mkdirSync(OUT, { recursive: true });

if (process.env.G16_NO_BUILD !== '1') await buildSite('bench', console.log);
const port = PORTS.bench;
const target = {
	name: 'g16-diag',
	serve: { command: 'node', args: ['.output/server/index.mjs'], cwd: BENCH_APP_DIR, port },
	url: `http://127.0.0.1:${port}`,
};
const { stop } = await startTarget(target, { log: console.log });
const { chromium } = require('@playwright/test');
const browser = await chromium.launch();
const publicDir = join(BENCH_APP_DIR, '.output/public');
const sourceOf = (url) => {
	try {
		return readFileSync(join(publicDir, new URL(url).pathname), 'utf8');
	} catch {
		return null;
	}
};

const report = {};
try {
	for (const variant of (process.env.G16_VARIANTS ?? 'plain').split(','))
	for (const route of SITES.bench.routes) {
		const runs = [];
		for (let run = 0; run < RUNS; run++) {
			const visit = await openPage(browser, { coverage: true });
			try {
				const cpu = /cpu(\d+)/.exec(variant)?.[1];
				if (cpu) {
					const cdp = await visit.page.context().newCDPSession(visit.page);
					await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(cpu) });
				}
				if (variant.includes('park')) await visit.page.mouse.move(-1, -1);
				await visit.page.context().addInitScript(() => {
					const log = (globalThis.__g16 = { events: [], links: [], atLoad: null });
					const t = () => Math.round(performance.now() * 10) / 10;
					for (const type of ['pointermove', 'pointerover', 'pointerdown', 'mousemove', 'mouseover', 'touchstart', 'focusin', 'scroll', 'popstate'])
						addEventListener(type, (e) => log.events.push([type, t(), e.isTrusted, e.target?.nodeName ?? String(e.target), e.clientX ?? null, e.clientY ?? null, e.pointerType ?? null]), { capture: true, passive: true });
					new MutationObserver((records) => {
						for (const r of records)
							for (const n of r.addedNodes)
								if (n.nodeName === 'LINK' && n.rel === 'modulepreload') {
									const entry = { href: n.href.replace(location.origin, ''), added: t(), loaded: null };
									log.links.push(entry);
									n.addEventListener('load', () => (entry.loaded = t()), { once: true });
								}
					}).observe(document, { childList: true, subtree: true });
					addEventListener('load', () => {
						log.atLoad = {
							t: t(),
							pending: [...document.head.querySelectorAll('link[rel="modulepreload"]')]
								.filter((l) => !performance.getEntriesByName(l.href, 'resource').length)
								.map((l) => l.href.replace(location.origin, '')),
						};
					}, { once: true });
				});
				const t0 = Date.now();
				await visit.goto(new URL(route, target.url).href);
				const tGoto = Date.now() - t0;
				await visit.idle();
				const tIdle = Date.now() - t0;
				const scripts = await visit.coverage.take();
				const timeline = await visit.page.evaluate(() => ({
					g16: globalThis.__g16,
					now: performance.now(),
					nav: performance.getEntriesByType('navigation').map((e) => ({
						dcl: e.domContentLoadedEventEnd,
						load: e.loadEventEnd,
					}))[0],
					resources: performance
						.getEntriesByType('resource')
						.map((e) => [new URL(e.name).pathname, Math.round(e.startTime), Math.round(e.responseEnd)]),
				}));
				const seen = new Map();
				const fns = {};
				let total = 0;
				for (const script of scripts) {
					const n = seen.get(script.url) ?? 0;
					seen.set(script.url, n + 1);
					const key = `${new URL(script.url).pathname}#${n}`;
					const length = scriptLength(script.functions);
					const mask = executedMask(script.functions, length);
					const chars = mask.reduce((t, b) => t + b, 0);
					total += chars;
					for (const fn of script.functions) {
						const r = fn.ranges[0];
						if (!r || r.count === 0) continue;
						let own = 0;
						for (let i = r.startOffset; i < r.endOffset && i < length; i++) own += mask[i];
						fns[`${key}@${r.startOffset}-${r.endOffset}:${fn.functionName}`] = own;
					}
				}
				runs.push({ total, tGoto, tIdle, timeline, fns });
			} finally {
				await visit.close();
			}
		}
		const totals = runs.map((r) => r.total);
		const all = new Set(runs.flatMap((r) => Object.keys(r.fns)));
		const variable = [...all]
			.map((k) => ({
				key: k,
				in: runs.filter((r) => k in r.fns).length,
				chars: [...new Set(runs.filter((r) => k in r.fns).map((r) => r.fns[k]))],
			}))
			.filter((v) => v.in < RUNS || v.chars.length > 1);
		for (const v of variable) {
			const [file, rest] = v.key.split('#');
			const [, start, end] = /@(\d+)-(\d+)/.exec(rest);
			const code = sourceOf(`${target.url}${file}`);
			v.snippet = code ? code.slice(Number(start), Math.min(Number(end), Number(start) + 400)) : null;
		}
		report[`${variant} ${route}`] = { totals, variable, runs };
		console.log(`\n=== ${variant} ${route}: totals ${totals.join(' ')}`);
		for (const r of runs)
			console.log(
				`  total ${r.total} goto ${r.tGoto}ms idle ${r.tIdle}ms load ${Math.round(r.timeline.nav?.load ?? -1)} now ${Math.round(r.timeline.now)}\n    events ${JSON.stringify(r.timeline.g16?.events)}\n    atLoad ${JSON.stringify(r.timeline.g16?.atLoad)}\n    links ${JSON.stringify(r.timeline.g16?.links)}`,
			);
		for (const v of variable)
			console.log(`  VAR in ${v.in}/${RUNS} chars ${v.chars.join(',')} ${v.key}\n    ${JSON.stringify(v.snippet)}`);
	}
} finally {
	writeFileSync(join(OUT, 'report.json'), JSON.stringify(report));
	await browser.close();
	await stop();
}
