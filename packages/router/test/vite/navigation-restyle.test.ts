import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// Each page links its own stylesheet, as a site whose stylesheets are cut per page does. A whole-document restyle of a long
// page is the costliest step of an in-place navigation on a slow phone, so one navigation may cause one.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

const SHEET = '*, ::before, ::after { box-sizing: border-box; } section p { margin: 0 0 8px; } li { line-height: 1.4; }';

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-navigation-restyle-'));
	await cp(resolve(import.meta.dirname, '../fixtures/shared-layout-app'), root, { recursive: true });
	await mkdir(join(root, 'public'), { recursive: true });
	for (const name of ['alpha', 'beta']) await writeFile(join(root, `public/${name}.css`), `${SHEET}\n/* ${name} */\n`);
	await writeFile(
		join(root, 'document.tsrx'),
		`import type { Children } from '@markless/core';
import { Html } from '@markless/router';

export default function Document({ url, children }: { readonly url?: { readonly pathname: string }; readonly children?: Children }) @{
	const sheet = url?.pathname === '/beta' ? '/beta.css' : '/alpha.css';
	<Html>
		<head>
			<meta charset="utf-8" />
			<link rel="stylesheet" href={sheet} />
			<style>{'body { margin: 0; font: 14px sans-serif; } .side a { display: block; padding: 4px 8px; } .badge, .panel { transition: background-color 1s, color 1s; } .badge-solid { background-color: rgb(250, 0, 0); } .badge-outline { background-color: rgb(0, 0, 250); }'}</style>
		</head>
		<body>{children}</body>
	</Html>;
}
`,
	);
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	const builder = await createBuilder({ root, configFile: false, logLevel: 'silent', plugins: [markless(), router()] });
	await builder.buildApp();
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	browser = await launchBrowser(chromium);
});

afterAll(async () => {
	await browser?.close();
	server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

let swapMs = 0;

type TraceEvent = { name: string; ph: string; args?: { elementCount?: number; data?: { elementCount?: number }; beginData?: { elementCount?: number } } };

// Style recalculations that visited at least half the document's elements, from the click until the destination has shown for 10 frames.
async function wholeDocumentRestyles(page: Page, selector: string, title: string): Promise<number> {
	const session = await page.context().newCDPSession(page);
	const events: TraceEvent[] = [];
	session.on('Tracing.dataCollected', ({ value }) => events.push(...(value as TraceEvent[])));
	const box = (await page.locator(selector).boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
	await page.waitForTimeout(450);
	await session.send('Tracing.start', {
		categories: 'devtools.timeline,disabled-by-default-devtools.timeline',
		transferMode: 'ReportEvents',
	});
	const clicked = Date.now();
	await page.mouse.down();
	await page.mouse.up();
	await page.waitForFunction((title) => document.querySelector('[data-title]')?.textContent === title, title);
	swapMs = Date.now() - clicked;
	await page.evaluate(
		() =>
			new Promise<void>((done) => {
				let left = 10;
				const tick = () => (--left ? requestAnimationFrame(tick) : done());
				requestAnimationFrame(tick);
			}),
	);
	const elements = await page.evaluate(() => document.getElementsByTagName('*').length);
	const complete = new Promise((done) => session.once('Tracing.tracingComplete', done));
	await session.send('Tracing.end');
	await complete;
	const counts = events
		.filter((event) => event.name === 'UpdateLayoutTree')
		.map((event) => event.args?.elementCount ?? event.args?.data?.elementCount ?? event.args?.beginData?.elementCount ?? 0);
	return counts.filter((count) => count >= elements / 2).length;
}

test('an in-place navigation that swaps the page and its stylesheet restyles the whole document once', async () => {
	const page = await browser!.newPage({ viewport: { width: 1000, height: 700 } });
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${server!.origin}/alpha`);
	await page.waitForLoadState('networkidle');
	expect(await wholeDocumentRestyles(page, '[data-top="beta"]', 'Beta')).toBe(1);
	// A hidden arriving stylesheet still loads and reports it: the swap never sits out the 3 s stylesheet timeout.
	expect(swapMs).toBeLessThan(1500);
	expect(await page.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.getAttribute('href')))).toEqual(['/beta.css']);
	expect(await page.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.getAttribute('media')))).toEqual([null]);
	expect(errors).toEqual([]);
	await page.close();
});

test('the leaving page keeps its own stylesheet until the swap, however long the destination\'s code takes after its stylesheet arrived', async () => {
	const page = await browser!.newPage({ viewport: { width: 1000, height: 700 } });
	await page.goto(`${server!.origin}/alpha`);
	await page.waitForLoadState('networkidle');
	const box = (await page.locator('[data-top="beta"]').boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
	await page.waitForTimeout(450);
	await page.evaluate(() => {
		const host = globalThis as { __mixed?: boolean };
		host.__mixed = false;
		const tick = () => {
			const title = document.querySelector('[data-title]')?.textContent;
			const applied = [...document.styleSheets].filter((sheet) => !sheet.disabled && (sheet.media.length === 0 || matchMedia(sheet.media.mediaText).matches)).map((sheet) => sheet.href ?? '');
			if (title === 'Alpha' && applied.some((href) => href.endsWith('/beta.css'))) host.__mixed = true;
			if (title !== 'Beta') requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	await page.mouse.down();
	await page.mouse.up();
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Beta');
	expect(await page.evaluate(() => (globalThis as { __mixed?: boolean }).__mixed)).toBe(false);
	await page.close();
});
