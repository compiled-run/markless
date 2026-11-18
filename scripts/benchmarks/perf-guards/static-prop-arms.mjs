// G18: the JavaScript pages load when they pass a component only literal props that rule out the arm rendering its child, with that child short and long.
import { execFile } from 'node:child_process';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
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
export const STATIC_PROP_ARM_FIXTURE = join(
	ROOT_DIR,
	'packages/router/test/fixtures/static-prop-arm-app',
);
// `/` and the MDX `/notes` pass Caption only text; `/glossary` passes the word that shows Gloss.
export const STATIC_PROP_ARM_ROUTES = { tsrx: '/', mdx: '/notes', shown: '/glossary' };
const LOADS = 3;

const VITE_CONFIG = `import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';

export default { plugins: [markless(), router()] };
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

async function buildVariant(gloss, log) {
	const root = await mkdtemp(join(tmpdir(), `markless-static-prop-${gloss}-`));
	await cp(STATIC_PROP_ARM_FIXTURE, root, { recursive: true });
	if (gloss === 'long')
		await copyFile(
			join(root, 'components/long-gloss.tsrx'),
			join(root, 'components/gloss.tsrx'),
		);
	await rm(join(root, 'components/long-gloss.tsrx'));
	await writeFile(join(root, 'vite.config.ts'), VITE_CONFIG);
	await writeFile(join(root, 'package.json'), '{ "private": true, "type": "module" }\n');
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(
			join(ROOT_DIR, 'packages', pkg),
			join(root, 'node_modules/@markless', pkg),
			'dir',
		);
	log(`static-prop arms: building with the ${gloss} Gloss`);
	await exec(join(ROOT_DIR, 'node_modules/.bin/vp'), ['build'], {
		cwd: root,
		env: { ...process.env, NODE_ENV: 'production' },
		maxBuffer: 64 * 1024 * 1024,
	});
	return root;
}

// The lowest JavaScript run and downloaded (gzip) through load and a settle, over a few fresh loads.
async function loadCost(browser, origin, route, publicDir) {
	let executedChars = Infinity;
	let jsGzipBytes = Infinity;
	for (let run = 0; run < LOADS; run++) {
		const context = await browser.newContext();
		const page = await context.newPage();
		const fetched = new Set();
		page.on('response', (response) => {
			const url = new URL(response.url());
			if (url.origin === origin && url.pathname.endsWith('.js')) fetched.add(url.pathname);
		});
		try {
			const coverage = await startCoverage(context, page);
			await page.goto(new URL(route, origin).href, { waitUntil: 'load' });
			await page.waitForTimeout(500);
			const scripts = await coverage.take();
			await coverage.stop();
			executedChars = Math.min(
				executedChars,
				scripts.reduce(
					(total, script) => total + countSet(executedMask(script.functions)),
					0,
				),
			);
			let bytes = 0;
			for (const path of fetched)
				bytes += gzipSync(await readFile(join(publicDir, decodeURIComponent(path))), {
					level: 9,
				}).length;
			jsGzipBytes = Math.min(jsGzipBytes, bytes);
		} finally {
			await context.close();
		}
	}
	return { executedChars, jsGzipBytes };
}

// The glossary page still answers: its Gloss opens on the first click.
async function glossAnswers(browser, origin) {
	const context = await browser.newContext();
	const page = await context.newPage();
	try {
		await page.goto(new URL(STATIC_PROP_ARM_ROUTES.shown, origin).href, { waitUntil: 'load' });
		await page.locator('[data-gloss]').click();
		await page.locator('[data-note]:not([hidden])').waitFor({ timeout: 10_000 });
		return true;
	} catch {
		return false;
	} finally {
		await context.close();
	}
}

async function measureVariant(browser, gloss, log) {
	const root = await buildVariant(gloss, log);
	const port = await freePort();
	const { stop } = await startTarget(
		{
			name: `perf-guard-static-prop-${gloss}`,
			serve: { command: 'node', args: ['.output/server/index.mjs'], cwd: root, port },
			url: `http://127.0.0.1:${port}`,
		},
		{ log },
	);
	const origin = `http://127.0.0.1:${port}`;
	try {
		const routes = {};
		for (const [name, route] of Object.entries(STATIC_PROP_ARM_ROUTES))
			routes[name] = await loadCost(browser, origin, route, join(root, '.output/public'));
		return { routes, answered: await glossAnswers(browser, origin) };
	} finally {
		await stop();
		await rm(root, { recursive: true, force: true });
	}
}

export async function measureStaticPropArms(log = () => {}) {
	const browser = await chromium.launch();
	try {
		return {
			short: await measureVariant(browser, 'short', log),
			long: await measureVariant(browser, 'long', log),
		};
	} finally {
		await browser.close();
	}
}
