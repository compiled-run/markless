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

// A page-scoped shared() in lib/choice.tsrx read by three routes; its browser instance lives for the document.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
const roots: string[] = [];
const servers: Record<'region' | 'document', BuiltServer | undefined> = {
	region: undefined,
	document: undefined,
};
let browser: Browser | undefined;

// The same app twice: its page swaps as a region, and, with a document that reads its props, as the whole body.
async function serveApp(mode: 'region' | 'document'): Promise<BuiltServer> {
	const root = await mkdtemp(join(tmpdir(), `markless-shared-navigation-${mode}-`));
	roots.push(root);
	await cp(resolve(import.meta.dirname, '../fixtures/shared-navigation-app'), root, {
		recursive: true,
	});
	if (mode === 'document')
		await writeFile(
			join(root, 'document.tsrx'),
			'export default function Document(props) @{ <html><head><meta charset="utf-8" /></head><body data-path={props.url.pathname}>{props.children}</body></html> }\n',
		);
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [markless(), router()],
	});
	await builder.buildApp();
	return startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
}

beforeAll(async () => {
	[servers.region, servers.document] = await Promise.all([
		serveApp('region'),
		serveApp('document'),
	]);
	browser = await launchBrowser(chromium);
}, 240_000);

afterAll(async () => {
	await browser?.close();
	await Promise.all(Object.values(servers).map((server) => server?.close()));
	await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function open(
	path: string,
	mode: 'region' | 'document' = 'region',
): Promise<{ page: Page; errors: string[] }> {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.goto(`${servers[mode]!.origin}${path}`);
	await page.waitForLoadState('networkidle');
	return { page, errors };
}

const origin = () => servers.region!.origin;

type Frame = {
	readonly title?: string;
	readonly shown?: string;
	readonly mode?: string;
	readonly badge?: string;
};

const shown = (page: Page) =>
	page.evaluate(() => document.querySelector('[data-shown]')?.textContent);

const title = (page: Page, text: string) =>
	page.waitForFunction(
		(want) => document.querySelector('[data-title]')?.textContent === want,
		text,
	);

// Records what every frame is about to paint, until `recordedFrames()` reads them.
const recordFrames = (page: Page) =>
	page.evaluate(() => {
		const host = globalThis as { __frames?: Frame[]; __recording?: boolean };
		host.__frames = [];
		host.__recording = true;
		const tick = () => {
			const mode = document.querySelector('[data-mode]');
			host.__frames!.push({
				badge: document.querySelector('[data-badge]')?.textContent ?? undefined,
				title: document.querySelector('[data-title]')?.textContent ?? undefined,
				shown: document.querySelector('[data-shown]')?.textContent ?? undefined,
				mode: mode ? `${mode.getAttribute('data-mode')}/${mode.textContent}` : undefined,
			});
			if (host.__recording) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});

const recordedFrames = (page: Page) =>
	page.evaluate(() => {
		const host = globalThis as { __frames?: Frame[]; __recording?: boolean };
		host.__recording = false;
		return host.__frames ?? [];
	});

const settleFrames = (page: Page) =>
	page.evaluate(
		() =>
			new Promise<void>((done) =>
				requestAnimationFrame(() => requestAnimationFrame(() => done())),
			),
	);

test.each(['region', 'document'] as const)('a value set on one page is the value every frame of the next page shows after an in-place navigation (%s swap)', async (mode) => {
	const { page, errors } = await open('/', mode);
	await page.click('[data-manual]');
	await expect.poll(() => shown(page)).toBe('manual');
	await recordFrames(page);
	await page.click('[data-go-next]');
	await title(page, 'Next');
	await settleFrames(page);
	const frames = (await recordedFrames(page)).filter((frame) => frame.title === 'Next');
	expect(frames.length).toBeGreaterThan(0);
	expect(frames.filter((frame) => frame.shown !== 'manual')).toEqual([]);
	expect(frames.filter((frame) => frame.mode !== 'chosen/chosen')).toEqual([]);
	expect(errors).toEqual([]);
	await page.close();
});

test('a page that only reads the instance, and a widget seeded from it, show the live value in every frame', async () => {
	const { page, errors } = await open('/');
	await page.click('[data-manual]');
	await expect.poll(() => shown(page)).toBe('manual');
	await recordFrames(page);
	await page.click('[data-go-plain]');
	await title(page, 'Plain');
	await settleFrames(page);
	const frames = (await recordedFrames(page)).filter((frame) => frame.title === 'Plain');
	expect(frames.length).toBeGreaterThan(0);
	expect(
		frames.filter(
			(frame) =>
				frame.shown !== 'manual' || frame.mode !== 'chosen/chosen' || frame.badge !== 'manual',
		),
	).toEqual([]);
	expect(errors).toEqual([]);
	await page.close();
});

test('the next page writes the kept instance, and its handlers read the live value', async () => {
	const { page, errors } = await open('/');
	await page.click('[data-manual]');
	await expect.poll(() => shown(page)).toBe('manual');
	await page.click('[data-go-next]');
	await title(page, 'Next');
	await page.click('[data-auto]');
	await expect.poll(() => shown(page)).toBe('auto');
	await page.click('[data-go-home]');
	await title(page, 'Home');
	expect(await shown(page)).toBe('auto');
	expect(errors).toEqual([]);
	await page.close();
});

test('Back and Forward keep the live value, in every frame', async () => {
	const { page, errors } = await open('/');
	await page.click('[data-manual]');
	await expect.poll(() => shown(page)).toBe('manual');
	await page.click('[data-go-next]');
	await title(page, 'Next');
	await page.click('[data-auto]');
	await expect.poll(() => shown(page)).toBe('auto');
	await recordFrames(page);
	await page.goBack();
	await title(page, 'Home');
	await settleFrames(page);
	const back = (await recordedFrames(page)).filter((frame) => frame.title === 'Home');
	expect(back.length).toBeGreaterThan(0);
	expect(back.filter((frame) => frame.shown !== 'auto')).toEqual([]);
	await page.click('[data-manual]');
	await expect.poll(() => shown(page)).toBe('manual');
	await recordFrames(page);
	await page.goForward();
	await title(page, 'Next');
	await settleFrames(page);
	const forward = (await recordedFrames(page)).filter((frame) => frame.title === 'Next');
	expect(forward.length).toBeGreaterThan(0);
	expect(forward.filter((frame) => frame.shown !== 'manual')).toEqual([]);
	expect(errors).toEqual([]);
	await page.close();
});

test('a full reload starts again from the served value', async () => {
	const { page, errors } = await open('/');
	await page.click('[data-manual]');
	await page.click('[data-go-next]');
	await title(page, 'Next');
	expect(await shown(page)).toBe('manual');
	await page.reload();
	await page.waitForLoadState('networkidle');
	expect(await shown(page)).toBe('cli');
	await page.click('[data-go-home]');
	await title(page, 'Home');
	expect(await shown(page)).toBe('cli');
	expect(errors).toEqual([]);
	await page.close();
});

test('a server request never sees a value another request or a browser wrote', async () => {
	const { page } = await open('/');
	await page.click('[data-manual]');
	await expect.poll(() => shown(page)).toBe('manual');
	const responses = await Promise.all(
		['/', '/next', '/_markless/fragment/next', '/_markless/fragment/'].map(async (path) =>
			(await fetch(`${origin()}${path}`)).text(),
		),
	);
	for (const html of responses) {
		expect(html).toMatch(/data-shown[^>]*>cli</);
		expect(html).not.toMatch(/data-shown[^>]*>manual</);
	}
	await page.close();
});

test('an async computed that reads the instance re-derives from the live value after a navigation', async () => {
	const { page, errors } = await open('/');
	expect(await (await fetch(`${origin()}/async`)).text()).toMatch(
		/data-label[^>]*>label cli</,
	);
	await page.click('[data-manual]');
	await expect.poll(() => shown(page)).toBe('manual');
	await page.click('[data-go-async]');
	await title(page, 'Async');
	expect(await shown(page)).toBe('manual');
	await expect
		.poll(() => page.evaluate(() => document.querySelector('[data-label]')?.textContent))
		.toBe('label manual');
	await page.click('[data-auto]');
	await expect
		.poll(() => page.evaluate(() => document.querySelector('[data-label]')?.textContent))
		.toBe('label auto');
	expect(errors).toEqual([]);
	await page.close();
});
