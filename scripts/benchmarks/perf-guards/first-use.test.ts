import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { firstUseSweep } from '../../../demos/interaction-benchmark/runner/lib/controls.mjs';

const require = createRequire(new URL('../../../demos/news/package.json', import.meta.url));
const { chromium } = require('playwright');

// Like the router's idle tier: one idle period prefetches the worker into the HTTP cache, a chained one fetches a file no control needs.
const PAGE = `<!doctype html><html><body>
<button id="cached" type="button">cached</button>
<button id="network" type="button">network</button>
<script type="module">
requestIdleCallback(() => {
	const link = document.createElement('link');
	link.rel = 'prefetch';
	link.href = '/worker.js';
	link.onload = () => requestIdleCallback(() => import('/idle-only.js'));
	document.head.append(link);
});
document.getElementById('cached').addEventListener('click', () => new Worker('/worker.js', { type: 'module' }));
document.getElementById('network').addEventListener('click', () => import('/uncached.js'));
</script>
</body></html>`;

let server: ReturnType<typeof createServer>;
let origin = '';
let browser: { close(): Promise<void> };

beforeAll(async () => {
	server = createServer((request, response) => {
		if (request.url === '/') {
			response.setHeader('content-type', 'text/html');
			return response.end(PAGE);
		}
		response.setHeader('content-type', 'text/javascript');
		response.setHeader('cache-control', 'public, max-age=31536000, immutable');
		response.end('export {};');
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	browser = await chromium.launch();
});

afterAll(async () => {
	await browser?.close();
	await new Promise((resolve) => server?.close(resolve));
});

test('a first use counts the JS it fetches from the network, after the page went idle', async () => {
	const sweep = await firstUseSweep(browser, `${origin}/`);
	const fetched = Object.fromEntries(
		sweep.controls.map((control: { key: string; inputJs: string[] }) => [
			control.key,
			control.inputJs.map((url) => new URL(url).pathname),
		]),
	);
	expect(fetched).toEqual({ 'button:cached': [], 'button:network': ['/uncached.js'] });
}, 60_000);
