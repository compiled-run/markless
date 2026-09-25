// Usage: node website-capture.mjs <outDir> <label>: serves website/.output and records the JS/CSS/font set of
// two docs routes (load, network idle, 1.5 s) plus a manifest of every such file in the build.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { repoRoot } from './apps.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const [outDir, label] = process.argv.slice(2);
const W = join(repoRoot, 'website');
const port = 20000 + Math.floor(Math.random() * 30000);
const server = spawn('node', [`${W}/.output/server/index.mjs`], {
	env: { ...process.env, PORT: String(port) },
	stdio: 'ignore',
	detached: true,
});
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 200; i++) {
	try {
		await fetch(base + '/markless/');
		break;
	} catch {
		await new Promise((r) => setTimeout(r, 100));
	}
}
const browser = await chromium.launch();
const routes = {};
try {
	for (const path of ['/markless/', '/markless/concepts/state']) {
		const context = await browser.newContext();
		const page = await context.newPage();
		const urls = new Set();
		page.on('request', (req) => {
			const u = new URL(req.url());
			if (u.host === `127.0.0.1:${port}` && /\.(m?js|css|woff2?)$/.test(u.pathname))
				urls.add(u.pathname.replace(/^\/markless/, ''));
		});
		await page.goto(base + path, { waitUntil: 'load' });
		try {
			await page.waitForLoadState('networkidle', { timeout: 10000 });
		} catch {}
		await page.waitForTimeout(1500);
		routes[path] = [...urls].sort();
		await context.close();
	}
} finally {
	await browser.close();
	process.kill(-server.pid);
}
const pub = `${W}/.output/public`;
const files = {};
(function walk(d) {
	for (const e of readdirSync(d)) {
		const p = join(d, e);
		if (statSync(p).isDirectory()) walk(p);
		else if (/\.(m?js|css|woff2?)$/.test(e)) {
			const b = readFileSync(p);
			files['/' + relative(pub, p)] = {
				sha: createHash('sha256').update(b).digest('hex'),
				gz: gzipSync(b, { level: 9 }).length,
			};
		}
	}
})(pub);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${label}.json`), JSON.stringify({ routes, files }));
console.log(
	label,
	Object.fromEntries(Object.entries(routes).map(([k, v]) => [k, v.length])),
	Object.keys(files).length,
);
