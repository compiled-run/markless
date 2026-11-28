import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { buildFixture } from '../support/fixture-build.ts';

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
	// Alpha links to Beta after its frame: the swap fills the frame with Beta's parts before it removes that link.
	const alpha = join(root, 'pages/alpha.tsrx');
	await writeFile(alpha, (await readFile(alpha, 'utf8')).replace(`</Frame>`, `</Frame><p><a href="/beta" data-in-page>{'Read beta'}</a></p>`));
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
			<style>{'body { margin: 0; font: 14px sans-serif; } .side a { display: block; padding: 4px 8px; } .badge, .panel { transition: background-color 1s, color 1s; } .badge-solid { background-color: rgb(250, 0, 0); } .badge-outline { background-color: rgb(0, 0, 250); } .top { position: sticky; top: 0; background: white; } .side { height: 200px; overflow: auto; }'}</style>
		</head>
		<body>{children}</body>
	</Html>;
}
`,
	);
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await buildFixture({ root });
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
	await page.locator(selector).scrollIntoViewIfNeeded();
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

test('a navigation from a link the swap removes restyles the whole document once', async () => {
	const page = await browser!.newPage({ viewport: { width: 1000, height: 700 } });
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${server!.origin}/alpha`);
	await page.waitForLoadState('networkidle');
	// Removing the focused link mid-swap would force a style recalculation of the half-built document.
	expect(await wholeDocumentRestyles(page, '[data-in-page]', 'Beta')).toBe(1);
	expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
	expect(errors).toEqual([]);
	await page.close();
});

// Every read here makes the engine bring style and layout up to date; WebKit restyles the whole leaving page once a hidden sheet is in its head.
const READS: readonly (readonly [string, string, 'method' | 'getter'])[] = [
	['Document', 'getAnimations', 'method'],
	['Element', 'getAnimations', 'method'],
	['Element', 'getBoundingClientRect', 'method'],
	['Element', 'getClientRects', 'method'],
	['Element', 'scrollTop', 'getter'],
	['Element', 'scrollLeft', 'getter'],
	['Element', 'scrollWidth', 'getter'],
	['Element', 'scrollHeight', 'getter'],
	['Element', 'clientWidth', 'getter'],
	['Element', 'clientHeight', 'getter'],
	['HTMLElement', 'offsetWidth', 'getter'],
	['HTMLElement', 'offsetHeight', 'getter'],
	['HTMLElement', 'offsetTop', 'getter'],
	['HTMLElement', 'offsetLeft', 'getter'],
	['HTMLElement', 'innerText', 'getter'],
	['HTMLElement', 'focus', 'method'],
	['Window', 'getComputedStyle', 'method'],
	['Window', 'scrollX', 'getter'],
	['Window', 'scrollY', 'getter'],
	['Window', 'pageXOffset', 'getter'],
	['Window', 'pageYOffset', 'getter'],
];

test('a navigation reads no style or layout of the leaving page once the arriving stylesheet is in its head', async () => {
	const page = await browser!.newPage({ viewport: { width: 1000, height: 700 } });
	await page.addInitScript((reads) => {
		const host = globalThis as unknown as Record<string, unknown>;
		const seen: string[] = [];
		host.__readsAfterMerge = seen;
		const mixed = () =>
			document.querySelector('[data-title]')?.textContent === 'Alpha' &&
			document.head?.querySelector('link[href="/beta.css"]') !== null;
		for (const [owner, name, kind] of reads) {
			// A global's attributes live on the global itself, not on its prototype.
			const proto = owner === 'Window' && Object.getOwnPropertyDescriptor(globalThis, name) ? globalThis : (host[owner] as { prototype: object } | undefined)?.prototype;
			const descriptor = proto && Object.getOwnPropertyDescriptor(proto, name);
			const original = kind === 'getter' ? descriptor?.get : descriptor?.value;
			if (!proto || !descriptor || typeof original !== 'function') continue;
			const wrapped = function (this: unknown, ...args: unknown[]) {
				if (mixed()) seen.push(`${owner}.${name}`);
				return (original as (...args: unknown[]) => unknown).apply(this, args);
			};
			Object.defineProperty(proto, name, kind === 'getter' ? { ...descriptor, get: wrapped } : { ...descriptor, value: wrapped });
		}
	}, READS);
	await page.goto(`${server!.origin}/alpha`);
	await page.waitForLoadState('networkidle');
	await page.evaluate(async () => {
		document.querySelector('.side')!.scrollTop = 120;
		window.scrollTo(0, 400);
		await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
	});
	const box = (await page.locator('[data-top="beta"]').boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
	await page.waitForTimeout(450);
	await page.mouse.down();
	await page.mouse.up();
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Beta');
	expect(await page.evaluate(() => (globalThis as { __readsAfterMerge?: string[] }).__readsAfterMerge)).toEqual([]);
	// What those reads were for still holds: the kept sidebar keeps its offset, and Back lands where the reader left Alpha.
	expect(await page.evaluate(() => document.querySelector('.side')!.scrollTop)).toBe(120);
	await page.goBack();
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Alpha');
	await page.waitForFunction(() => window.scrollY === 400);
	await page.close();
});

test('a scroll while the swap waits for its stylesheet is where Back lands', async () => {
	const page = await browser!.newPage({ viewport: { width: 1000, height: 700 } });
	let release!: () => void;
	const held = new Promise<void>((done) => (release = done));
	await page.route('**/beta.css', async (route) => {
		await held;
		await route.continue();
	});
	await page.goto(`${server!.origin}/alpha`);
	await page.waitForFunction(() => document.querySelector('[data-top="beta"]') !== null);
	await page.evaluate(() => window.scrollTo(0, 400));
	await page.locator('[data-top="beta"]').click();
	// The swap has merged the head and waits for the arriving stylesheet.
	await page.waitForFunction(() => document.head.querySelector('link[href="/beta.css"][media="not all"]') !== null);
	await page.evaluate(async () => {
		window.scrollTo(0, 250);
		await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
	});
	expect(await page.evaluate(() => document.querySelector('[data-title]')?.textContent)).toBe('Alpha');
	release();
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Beta');
	await page.goBack();
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Alpha');
	await page.waitForFunction(() => window.scrollY === 250);
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
