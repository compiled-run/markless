// Weighs one served page: html, its resume data scripts by record list, JavaScript downloaded at
// load and JavaScript executed at load (V8 precise coverage once two snapshots agree), raw and gzip.
// usage: node scripts/benchmarks/resume-data/measure-page.mjs <url> [--label name] [--json]

import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { resumeDataBreakdown } from './breakdown.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { chromium } = createRequire(resolve(ROOT, 'demos/news/package.json'))('playwright');

const gzip = (text) => gzipSync(text, { level: 9 }).length;

export async function measurePage(url) {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const cdp = await page.context().newCDPSession(page);
		const scriptUrls = new Map();
		await cdp.send('Profiler.enable');
		await cdp.send('Debugger.enable');
		cdp.on('Debugger.scriptParsed', (event) => scriptUrls.set(event.scriptId, event.url));
		await cdp.send('Profiler.startPreciseCoverage', { callCount: false, detailed: true });
		const downloads = new Map();
		page.on('response', async (response) => {
			const type = response.request().resourceType();
			if (type !== 'script') return;
			const body = await response.body().catch(() => null);
			if (body) downloads.set(response.url(), body);
		});
		const htmlResponse = await page.goto(url, { waitUntil: 'load' });
		const html = (await htmlResponse.body()).toString('utf8');
		const executed = await quiescedExecution(cdp, page, scriptUrls, new URL(url).origin);
		await cdp.send('Profiler.stopPreciseCoverage');
		const scripts = [...downloads.values()];
		return {
			url,
			html: { raw: Buffer.byteLength(html), gzip: gzip(html) },
			resumeData: resumeDataBreakdown(html),
			jsDownloadedAtLoad: {
				files: scripts.length,
				raw: scripts.reduce((t, b) => t + b.length, 0),
				gzip: scripts.reduce((t, b) => t + gzip(b), 0),
				perFile: Object.fromEntries(
					[...downloads].map(([u, b]) => [new URL(u).pathname, b.length]),
				),
			},
			jsExecutedAtLoad: executed,
		};
	} finally {
		await browser.close();
	}
}

// Each take resets V8's best-effort counters, so executed characters are OR-ed per script until a
// take adds none.
async function quiescedExecution(cdp, page, scriptUrls, origin) {
	const masks = new Map();
	const perUrl = new Map();
	for (let attempt = 0; attempt < 40; attempt++) {
		const { result } = await cdp.send('Profiler.takePreciseCoverage');
		let added = 0;
		for (const script of result) {
			const scriptUrl = script.url || scriptUrls.get(script.scriptId) || '';
			if (!scriptUrl.startsWith(origin)) continue;
			const mask = executedMask(script.functions);
			const held = masks.get(script.scriptId) ?? new Uint8Array(mask.length);
			for (let i = 0; i < mask.length; i++)
				if (mask[i] && !held[i]) {
					held[i] = 1;
					added++;
					perUrl.set(scriptUrl, (perUrl.get(scriptUrl) ?? 0) + 1);
				}
			masks.set(script.scriptId, held);
		}
		if (attempt > 0 && added === 0) {
			const bytes = [...perUrl.values()].reduce((t, n) => t + n, 0);
			return { bytes, perScript: Object.fromEntries(perUrl) };
		}
		await page.waitForTimeout(250);
	}
	throw new Error(`coverage never quiesced on ${page.url()}`);
}

// The innermost range decides each character, as the perf guards' coverage.mjs counts it.
function executedMask(functions) {
	const ranges = functions.flatMap((fn) => fn.ranges);
	const length = ranges.reduce((max, r) => Math.max(max, r.endOffset), 0);
	ranges.sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
	const mask = new Uint8Array(length);
	for (const r of ranges) mask.fill(r.count > 0 ? 1 : 0, r.startOffset, r.endOffset);
	return mask;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const url = process.argv[2];
	if (!url) throw new Error('usage: measure-page.mjs <url> [--json]');
	const result = await measurePage(url);
	if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
	else {
		const r = result;
		console.log(`${url}`);
		console.log(`  html                 ${r.html.raw} raw, ${r.html.gzip} gzip`);
		console.log(
			`  resume data          ${r.resumeData.total.raw} raw, ${r.resumeData.total.gzip} gzip`,
		);
		for (const [name, size] of Object.entries(r.resumeData.lists))
			console.log(
				`    ${name.padEnd(28)} ${String(size.records).padStart(5)} records ${size.raw} raw, ${size.gzip} gzip`,
			);
		console.log(
			`  js downloaded @load  ${r.jsDownloadedAtLoad.raw} raw, ${r.jsDownloadedAtLoad.gzip} gzip (${r.jsDownloadedAtLoad.files} files)`,
		);
		console.log(`  js executed @load    ${r.jsExecutedAtLoad.bytes} bytes`);
	}
}
