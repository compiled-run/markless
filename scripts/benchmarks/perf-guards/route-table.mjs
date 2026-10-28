// G15: JavaScript run at load on a router page that links a few routes, and on the same page linking many.
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
	countSet,
	executedMask,
	startCoverage,
} from '../../../demos/interaction-benchmark/runner/lib/coverage.mjs';
import { startTarget } from '../../../demos/interaction-benchmark/runner/lib/serve.mjs';
import { ROOT_DIR } from './config.mjs';

const exec = promisify(execFile);
const require = createRequire(join(ROOT_DIR, 'demos/news/package.json'));
const { chromium } = require('playwright');
export const ROUTE_TABLE_LINKS = { few: 4, many: 120 };

const VITE_CONFIG = `import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';

export default { plugins: [markless(), router()] };
`;

const DOCUMENT = `import type { Children } from '@markless/core';
import { Html } from '@markless/router';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html>
		<head>
			<meta charset="utf-8" />
		</head>
		<body>{children}</body>
	</Html>;
}
`;

// Each linked page owns a handler, so each destination lists code of its own in the page's route table.
const linkedPage = (n) => `import { state } from '@markless/core';

export default function Page${n}() @{
	let taps = state(${n});

	<main>
		<h1>Page ${n}</h1>
		<output data-taps>{taps}</output>
		<button type="button" onClick={() => (taps += ${n})}>Add ${n}</button>
	</main>
}
`;

const indexPage = (links) => `import { state } from '@markless/core';

export default function Index() @{
	let opened = state(false);

	<main>
		<button type="button" data-open onClick={() => (opened = !opened)}>Menu</button>
		<output data-opened>{opened ? 'open' : 'closed'}</output>
		<nav>
${Array.from({ length: links }, (_, i) => `			<a href="/p${i}">Page ${i}</a>`).join('\n')}
		</nav>
	</main>
}
`;

function freePort() {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address();
			server.close(() => resolve(port));
		});
	});
}

async function buildVariant(links, log) {
	const root = await mkdtemp(join(tmpdir(), `markless-route-table-${links}-`));
	await mkdir(join(root, 'pages'), { recursive: true });
	await writeFile(join(root, 'document.tsrx'), DOCUMENT);
	await writeFile(join(root, 'pages/index.tsrx'), indexPage(links));
	for (let i = 0; i < ROUTE_TABLE_LINKS.many; i++)
		await writeFile(join(root, `pages/p${i}.tsrx`), linkedPage(i));
	await writeFile(join(root, 'vite.config.ts'), VITE_CONFIG);
	await writeFile(join(root, 'package.json'), '{ "private": true, "type": "module" }\n');
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(
			join(ROOT_DIR, 'packages', pkg),
			join(root, 'node_modules/@markless', pkg),
			'dir',
		);
	log(`route table: building a page linking ${links} of ${ROUTE_TABLE_LINKS.many} routes`);
	await exec(join(ROOT_DIR, 'node_modules/.bin/vp'), ['build'], {
		cwd: root,
		env: { ...process.env, NODE_ENV: 'production' },
		maxBuffer: 64 * 1024 * 1024,
	});
	return root;
}

// Source V8 ran by the load event, before any idle work, and the page still answers its own control.
async function runAtLoad(browser, origin) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	// Idle callbacks wait until the coverage is taken, so whether the browser went idle before it never moves the count.
	await page.addInitScript(() => {
		const idle = window.requestIdleCallback.bind(window);
		let held = [];
		window.requestIdleCallback = (callback, options) =>
			held ? (held.push([callback, options]), 0) : idle(callback, options);
		window.__releaseIdle = () => {
			const queued = held;
			held = null;
			for (const [callback, options] of queued) idle(callback, options);
		};
	});
	try {
		const coverage = await startCoverage(context, page);
		const response = await page.goto(origin, { waitUntil: 'load' });
		const scripts = await coverage.take();
		await coverage.stop();
		await page.evaluate(() => window.__releaseIdle());
		const executedChars = scripts.reduce(
			(total, script) => total + countSet(executedMask(script.functions)),
			0,
		);
		const htmlBytes = (await response.body()).length;
		await page.locator('[data-open]').click();
		await page.locator('[data-opened]', { hasText: 'open' }).waitFor({ timeout: 10_000 });
		return { executedChars, htmlBytes, answered: true, errors };
	} finally {
		await context.close();
	}
}

async function measureVariant(browser, links, log) {
	const root = await buildVariant(links, log);
	const port = await freePort();
	const { stop } = await startTarget(
		{
			name: `perf-guard-route-table-${links}`,
			serve: { command: 'node', args: ['.output/server/index.mjs'], cwd: root, port },
			url: `http://127.0.0.1:${port}`,
		},
		{ log },
	);
	try {
		return await runAtLoad(browser, `http://127.0.0.1:${port}/`);
	} finally {
		await stop();
		await rm(root, { recursive: true, force: true });
	}
}

export async function measureRouteTable(log = () => {}) {
	const browser = await chromium.launch();
	try {
		return {
			few: await measureVariant(browser, ROUTE_TABLE_LINKS.few, log),
			many: await measureVariant(browser, ROUTE_TABLE_LINKS.many, log),
		};
	} finally {
		await browser.close();
	}
}
