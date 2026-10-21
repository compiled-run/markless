// G14: JavaScript run at load, through an onIdle start, on one router page built with a short and a long hidden help panel.
import { execFile } from 'node:child_process';
import {
	copyFile,
	cp,
	mkdir,
	mkdtemp,
	readdir,
	rm,
	stat,
	symlink,
	writeFile,
} from 'node:fs/promises';
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
export const HIDDEN_CONTENT_FIXTURE = join(
	ROOT_DIR,
	'packages/router/test/fixtures/idle-hidden-panel-app',
);

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

async function shippedBytes(dir) {
	let total = 0;
	for (const entry of await readdir(dir, { recursive: true }))
		if (entry.endsWith('.js')) total += (await stat(join(dir, entry))).size;
	return total;
}

// The fixture with its help panel holding the short notes it ships, or the long ones in their place.
async function buildVariant(notes, log) {
	const root = await mkdtemp(join(tmpdir(), `markless-hidden-${notes}-`));
	await cp(HIDDEN_CONTENT_FIXTURE, root, { recursive: true });
	if (notes === 'long')
		await copyFile(
			join(root, 'components/long-notes.tsrx'),
			join(root, 'components/notes.tsrx'),
		);
	await rm(join(root, 'components/long-notes.tsrx'));
	await writeFile(join(root, 'vite.config.ts'), VITE_CONFIG);
	await writeFile(join(root, 'package.json'), '{ "private": true, "type": "module" }\n');
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(
			join(ROOT_DIR, 'packages', pkg),
			join(root, 'node_modules/@markless', pkg),
			'dir',
		);
	log(`hidden content: building the ${notes}-notes page`);
	await exec(join(ROOT_DIR, 'node_modules/.bin/vp'), ['build'], {
		cwd: root,
		env: { ...process.env, NODE_ENV: 'production' },
		maxBuffer: 64 * 1024 * 1024,
	});
	return root;
}

// Load, let the onIdle handler start the page, settle, and count the source V8 ran.
async function runAtLoad(browser, origin) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	try {
		const coverage = await startCoverage(context, page);
		await page.goto(origin, { waitUntil: 'load' });
		await page.locator('[data-ready]').waitFor({ state: 'attached', timeout: 10_000 });
		await page.waitForTimeout(500);
		const scripts = await coverage.take();
		await coverage.stop();
		const executedChars = scripts.reduce(
			(total, script) => total + countSet(executedMask(script.functions)),
			0,
		);
		// The page still answers: opening the date panel and moving a month rebuilds the grid's rows.
		await page.locator('[data-open]').click();
		const first = await page.locator('[data-day]').first().getAttribute('data-day');
		await page.locator('[data-next]').click();
		await page
			.locator(`[data-day]:not([data-day="${first}"])`)
			.first()
			.waitFor({ state: 'attached', timeout: 10_000 });
		await page.locator('[data-help]').click();
		await page.locator('[data-help-panel]:not([hidden])').waitFor({ timeout: 10_000 });
		return { executedChars, answered: true, errors };
	} finally {
		await context.close();
	}
}

async function measureVariant(browser, notes, log) {
	const root = await buildVariant(notes, log);
	const port = await freePort();
	const { stop } = await startTarget(
		{
			name: `perf-guard-hidden-${notes}`,
			serve: { command: 'node', args: ['.output/server/index.mjs'], cwd: root, port },
			url: `http://127.0.0.1:${port}`,
		},
		{ log },
	);
	try {
		return {
			shippedBytes: await shippedBytes(join(root, '.output/public')),
			...(await runAtLoad(browser, `http://127.0.0.1:${port}/`)),
		};
	} finally {
		await stop();
		await rm(root, { recursive: true, force: true });
	}
}

export async function measureHiddenContent(log = () => {}) {
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
