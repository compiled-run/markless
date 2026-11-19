import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, test } from 'vitest';
import { launchBrowser } from '../../../scripts/test-utils/browser.ts';
import { startBuiltServer, type BuiltServer } from '../../../scripts/test-utils/built-server.ts';
import { buildFixture } from '../../router/test/support/fixture-build.ts';
import { APPS, appsDir } from '../apps/measure.ts';
import { walks, type Walk } from '../apps/walks.ts';

// The yardstick apps' web reference: each app built as the router builds it, served by its production server and walked
// through in Chromium at a phone's size.
const packagesRoot = resolve(import.meta.dirname, '../..');
const PHONE = { width: 402, height: 778 };
const screenshots = process.env.MARKLESS_YARDSTICK_SCREENSHOTS;

let browser: Browser;
const cleanups: Array<() => Promise<void> | void> = [];

beforeAll(async () => {
	browser = await launchBrowser(chromium);
}, 60_000);

afterAll(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
	await browser.close();
}, 60_000);

async function serveApp(app: string): Promise<BuiltServer> {
	const root = await mkdtemp(join(tmpdir(), `markless-yardstick-${app}-`));
	cleanups.push(() => rm(root, { recursive: true, force: true }));
	await cp(join(appsDir, app), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router', 'device'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(
		join(packagesRoot, 'headless/components'),
		join(root, 'node_modules/@markless/ui'),
		'dir',
	);
	// API routes import the server runtime the router builds on.
	await symlink(
		join(packagesRoot, 'router/node_modules/nitro'),
		join(root, 'node_modules/nitro'),
		'dir',
	);
	const nodeEnv = process.env.NODE_ENV;
	// Vitest's NODE_ENV=test leaves import.meta.env.DEV true in a build.
	process.env.NODE_ENV = 'production';
	try {
		await buildFixture({ root, configFile: join(root, 'vite.config.ts') });
	} finally {
		if (nodeEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = nodeEnv;
	}
	const server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	cleanups.push(() => server.close());
	return server;
}

async function walkApp(app: string, walk: Walk) {
	const server = await serveApp(app);
	for (const colorScheme of ['light', 'dark'] as const) {
		const context: BrowserContext = await browser.newContext({
			viewport: PHONE,
			colorScheme,
			baseURL: server.origin,
			...walk.context,
		});
		try {
			const page: Page = await context.newPage();
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			await walk.run(page, {
				context,
				shot: async (name) => {
					if (screenshots)
						await page.screenshot({
							path: join(screenshots, app, colorScheme, `${name}.png`),
						});
				},
			});
			if (errors.length > 0) throw new Error(`page errors: ${errors.join('; ')}`);
		} catch (error) {
			throw new Error(
				`${app} (${colorScheme}): ${(error as Error).message}\nserver output:\n${server.output().slice(-4000)}`,
				{ cause: error },
			);
		} finally {
			await context.close();
		}
	}
}

describe('yardstick apps on the web', () => {
	for (const app of APPS) test(app, () => walkApp(app, walks[app]), 240_000);
});
