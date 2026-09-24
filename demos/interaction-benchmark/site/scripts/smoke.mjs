#!/usr/bin/env node
// Browser smoke of site/dist: serves it statically on PORT (default 4497), opens the index and one case page in Chromium.
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.resolve(siteDir, '..', '..', '..');
const dist = path.join(siteDir, 'dist');
const port = Number(process.env.PORT ?? 4497);
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(repoDir, 'node_modules/.pnpm/playwright@1.58.2/node_modules/playwright'));

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.jsonl': 'application/x-ndjson', '.md': 'text/markdown' };
const server = http.createServer((req, res) => {
	const url = new URL(req.url, 'http://x');
	let file = path.join(dist, decodeURIComponent(url.pathname));
	if (!file.startsWith(dist)) return res.writeHead(403).end();
	if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
	if (!fs.existsSync(file)) return res.writeHead(404).end('not found');
	res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
	fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

const checks = [];
const check = (name, ok, detail = '') => {
	checks.push(ok);
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};
const browser = await chromium.launch();
try {
	const page = await browser.newPage();
	const problems = [];
	page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
	page.on('pageerror', (e) => problems.push(e.message));
	page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
	const base = `http://127.0.0.1:${port}`;

	await page.goto(`${base}/index.html`);
	check('index: one h1', (await page.locator('h1').count()) === 1);
	check('index: entrants table lists 8 entrants', (await page.locator('#entrants + .table-wrap tbody tr').count()) === 8);
	check('index: says there is no single winner score', (await page.getByText('no overall winner score').count()) > 0);
	const runLink = page.locator('a[href^="runs/"][href$="/index.html"]').first();
	check('index: links a result run', (await runLink.count()) === 1);
	const sample = await page.locator('.sample-banner').count();
	check('index: sample runs are labeled SAMPLE', sample === 0 || (await page.locator('.badge.sample').count()) > 0);

	await runLink.click();
	await page.waitForLoadState('load');
	const caseHref = await page.locator('ul.toc a[href^="cases/"]').first().getAttribute('href');
	check('run page: lists case pages', Boolean(caseHref), caseHref);
	check('run page: raw downloads present', (await page.locator('a[href="results.jsonl"]').count()) === 1 && (await page.locator('a[href="raw.jsonl"]').count()) === 1 && (await page.locator('a[href="summary.json"]').count()) === 1);
	const raw = await page.request.get(new URL('results.jsonl', page.url()).href);
	check('run page: results.jsonl downloads', raw.ok() && (await raw.text()).trim().split('\n').length > 0);

	await page.goto(new URL(caseHref, page.url()).href);
	const chart = page.locator('figure.chart svg[role="img"]').first();
	check('case page: accessible SVG chart rendered', (await chart.count()) === 1 && (await chart.boundingBox())?.width > 100);
	check('case page: chart has title and desc', (await chart.locator('title').count()) === 1 && (await chart.locator('desc').count()) === 1);
	const heads = await page.locator('table').first().locator('thead th').allTextContents();
	check('case page: table shows median, p95, IQR, stddev, n and failures', ['OK / visits', 'Failures', 'Input→response median', 'p95', 'IQR', 'Std dev'].every((h) => heads.includes(h)), heads.join(', '));
	check('case page: presentation estimate labeled', (await page.getByText('presentation estimate').count()) > 0);
	check('no console errors, page errors or failed responses', problems.length === 0, problems.slice(0, 3).join(' | '));
} finally {
	await browser.close();
	server.close();
}
const failed = checks.filter((ok) => !ok).length;
console.log(`site smoke: ${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
