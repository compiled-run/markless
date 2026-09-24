// Client JS/CSS bytes each route fetches on initial load (gzip -9 per file, summed), against a running preview server.
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const { chromium } = createRequire(`${repoRoot}package.json`)('@playwright/test');
const origin = process.env.ORIGIN ?? `http://127.0.0.1:${process.env.PORT ?? 4470}`;

const browser = await chromium.launch();
for (const path of ['/', '/records', '/settings']) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const files = [];
	page.on('response', async (res) => {
		const url = new URL(res.url());
		if (!/\.(js|css)$/.test(url.pathname)) return;
		const body = await res.body();
		files.push({ kind: url.pathname.endsWith('.js') ? 'js' : 'css', name: url.pathname, raw: body.length, gzip: gzipSync(body, { level: 9 }).length });
	});
	const doc = await page.goto(origin + path, { waitUntil: 'networkidle' });
	const html = await doc.body();
	await page.waitForTimeout(500);
	const sum = (kind, key) => files.filter((f) => f.kind === kind).reduce((n, f) => n + f[key], 0);
	console.log(
		`${path}: js ${files.filter((f) => f.kind === 'js').length} files ${sum('js', 'raw')} B raw / ${sum('js', 'gzip')} B gzip; css ${sum('css', 'raw')} B raw / ${sum('css', 'gzip')} B gzip; html ${html.length} B raw / ${gzipSync(html, { level: 9 }).length} B gzip`
	);
	for (const f of files) console.log(`  ${f.name} ${f.raw} / ${f.gzip}`);
	await context.close();
}
await browser.close();
