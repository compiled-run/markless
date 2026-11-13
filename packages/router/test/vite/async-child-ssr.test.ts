import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { buildFixture } from '../support/fixture-build.ts';

// An async value in a component the page imports, on a production build served by its own Nitro server.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-async-child-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/async-child-app'), root, {
		recursive: true,
	});
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(resolve(packagesRoot, 'router/node_modules/nitro'), join(root, 'node_modules/nitro'), 'dir');
	await buildFixture({
		root,
	});
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	browser = await launchBrowser(chromium);
});

afterAll(async () => {
	await browser?.close();
	await server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

async function served(path: string, expected: ReadonlyArray<string>) {
	const html = await (await fetch(`${server!.origin}${path}`)).text();
	expect(expected.filter((text) => !html.includes(`>${text}<`))).toEqual([]);
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${server!.origin}${path}`);
	await expect.poll(() => page.locator('main').innerText()).toBe(expected.join('\n'));
	await page.waitForLoadState('networkidle');
	// lib/slow.ts counts every run of the recipe in the browser.
	expect(await page.evaluate(() => (window as { browserRuns?: number }).browserRuns ?? 0)).toBe(
		0,
	);
	expect(errors).toEqual([]);
	await page.close();
}

test('an async value in a component the page imports streams from the server', async () => {
	await served('/async-in-child', ['item 1']);
});

test('each instance of an async component, at any depth, streams its own value', async () => {
	await served('/async-in-children', ['head', 'item 1', 'item 2', 'item 3']);
});

test('a child with no props and a @try without @catch streams its value', async () => {
	await served('/child-async-not-streamed', ['loaded child']);
});

const browserRuns = (page: Page) => page.evaluate(() => (window as { browserRuns?: number }).browserRuns ?? 0);

// What the child shows now, without waiting: its value, its @pending, or the @catch text when the browser run failed.
async function detailText(page: Page) {
	if (await page.locator('#detail-failed').count()) return `failed: ${await page.locator('#detail-failed').textContent()}`;
	if (await page.locator('#detail-pending').count()) return 'pending';
	return page.locator('#detail').textContent();
}

// A component placed in a layout's children reads the page's `params` and `url` like one placed directly.
for (const placement of ['framed', 'direct']) {
	test(`a ${placement} child's value from params and url streams from the server, and the browser does not load it again`, async () => {
		const page = await browser!.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(`${server!.origin}/${placement}/abc`);
		await expect.poll(() => page.locator('#detail').textContent(), { timeout: 5_000 }).toBe(`got abc at /${placement}/abc #1`);
		await page.waitForLoadState('networkidle');
		expect(await browserRuns(page)).toBe(0);
		expect(await page.locator('#detail-failed').count()).toBe(0);
		expect(errors).toEqual([]);
		await page.close();
	});

	test(`a ${placement} child rendered by client navigation reads params and url`, async () => {
		const page = await browser!.newPage();
		await page.goto(`${server!.origin}/links`);
		await page.locator(`#to-${placement}`).click();
		await expect.poll(() => page.locator('#detail').textContent(), { timeout: 5_000 }).toBe(`got xyz at /${placement}/xyz #1`);
		await page.close();
	});

	test(`a ${placement} child's value re-run in the browser reads the page's url`, async () => {
		const page = await browser!.newPage();
		await page.goto(`${server!.origin}/${placement}/abc`);
		await expect.poll(() => page.locator('#detail').textContent(), { timeout: 5_000 }).toBe(`got abc at /${placement}/abc #1`);
		await page.locator('#again').click();
		await expect.poll(() => detailText(page), { timeout: 5_000 }).toBe(`got abc at /${placement}/abc #2`);
		await page.close();
	});
}

// A child whose async value reads the page's `params.id` and a `url` search value, wherever it sits.
// Each re-run in the browser reads what the first run read: no request with an undefined id, never the @catch.
type NoteRun = { readonly page: Page; readonly asked: string[]; readonly errors: string[] };

async function openNote(path: string): Promise<NoteRun> {
	const page = await browser!.newPage();
	const asked: string[] = [];
	const errors: string[] = [];
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (url.pathname === '/api/note') asked.push(`${request.method()} ${url.search}`);
	});
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${server!.origin}${path}`);
	return { page, asked, errors };
}

const noteText = async (page: Page) =>
	(await page.locator('#note-failed').count()) ? `failed: ${await page.locator('#note-failed').textContent()}` : await page.locator('#note').textContent();

async function expectNote(run: NoteRun, text: string) {
	await expect.poll(() => noteText(run.page), { timeout: 5_000 }).toBe(text);
}

async function expectReRuns(run: NoteRun, id: string, firstRound: number) {
	await run.page.locator('#again').click();
	await expectNote(run, `note ${id} tab info rev 0 #${firstRound + 1}`);
	await run.page.locator('#save').click();
	await expectNote(run, `note ${id} tab info rev 1 #${firstRound + 2}`);
	await run.page.waitForLoadState('networkidle');
	const query = `?id=${id}&tab=info`;
	expect(run.asked.filter((entry) => entry !== `GET ${query}` && entry !== `POST ?id=${id}`)).toEqual([]);
	expect(run.asked.filter((entry) => entry === `POST ?id=${id}`)).toHaveLength(1);
	expect(await run.page.locator('#note-failed').count()).toBe(0);
	expect(run.errors).toEqual([]);
	await run.page.close();
}

for (const placement of ['direct', 'framed', 'deep']) {
	test(`a ${placement} note served by the server re-runs in the browser with the page's params and url`, async () => {
		const id = `served-${placement}`;
		const run = await openNote(`/note/${placement}/${id}?tab=info`);
		await expectNote(run, `note ${id} tab info rev 0 #1`);
		await run.page.waitForLoadState('networkidle');
		expect(run.asked).toEqual([]);
		await expectReRuns(run, id, 1);
	});
}

test('a note opened by a click in an @if arm reads the page\'s params and url on its first run and every re-run', async () => {
	const id = 'served-opened';
	const run = await openNote(`/note/opened/${id}?tab=info`);
	await run.page.locator('#open').click();
	await expectNote(run, `note ${id} tab info rev 0 #1`);
	await expectReRuns(run, id, 1);
});

for (const placement of ['direct', 'framed', 'deep', 'opened']) {
	test(`a ${placement} note reached by client navigation re-runs with the new page's params and url`, async () => {
		const id = `nav-${placement}`;
		const run = await openNote('/note-links');
		await run.page.locator(`#to-${placement}`).click();
		await expect.poll(() => new URL(run.page.url()).pathname).toBe(`/note/${placement}/${id}`);
		if (placement === 'opened') await run.page.locator('#open').click();
		await expectNote(run, `note ${id} tab info rev 0 #1`);
		await expectReRuns(run, id, 1);
	});
}
