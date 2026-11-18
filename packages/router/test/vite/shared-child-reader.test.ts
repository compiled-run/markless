import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { buildFixture } from '../support/fixture-build.ts';

// An app-scoped shared() that no page reads itself: only Bar, a component every page renders, does.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
const roots: string[] = [];
const servers: Record<'page' | 'document', BuiltServer | undefined> = {
	page: undefined,
	document: undefined,
};
let browser: Browser | undefined;

// The same app twice: read only by the pages' components, and also read by the document.
async function serveApp(mode: 'page' | 'document'): Promise<BuiltServer> {
	const root = await mkdtemp(join(tmpdir(), `markless-shared-child-reader-${mode}-`));
	roots.push(root);
	await cp(resolve(import.meta.dirname, '../fixtures/shared-child-reader-app'), root, {
		recursive: true,
	});
	if (mode === 'document')
		await writeFile(
			join(root, 'document.tsrx'),
			[
				"import { Html } from '@markless/router';",
				"import { ui } from './components/ui.tsrx';",
				'export default function Document({ children }) @{',
				'\tconst u = ui();',
				"\t<Html lang=\"en\" class={u.open ? 'open' : undefined}><head><meta charset=\"utf-8\" /></head><body>{children}</body></Html>",
				'}',
				'',
			].join('\n'),
		);
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await buildFixture({ root });
	return startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
}

beforeAll(async () => {
	[servers.page, servers.document] = await Promise.all([serveApp('page'), serveApp('document')]);
	browser = await launchBrowser(chromium);
}, 240_000);

afterAll(async () => {
	await browser?.close();
	await Promise.all(Object.values(servers).map((server) => server?.close()));
	await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function open(): Promise<{ page: Page; errors: string[] }> {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.goto(`${servers.page!.origin}/`);
	await page.waitForLoadState('networkidle');
	return { page, errors };
}

const read = (page: Page) =>
	page.evaluate(() => ({
		open: document.querySelector('#toggle')?.textContent,
		count: document.querySelector('#count')?.textContent,
	}));

const title = (page: Page, text: string) =>
	page.waitForFunction((want) => document.querySelector('[data-title]')?.textContent === want, text);

test('values written on one page are what the next page shows after a link, and Back keeps the later write', async () => {
	const { page, errors } = await open();
	await page.click('#toggle');
	await page.click('#count');
	await page.click('#count');
	await expect.poll(() => read(page)).toEqual({ open: 'open: yes', count: 'count: 2' });
	await page.click('[data-go-other]');
	await title(page, 'Other');
	expect(await read(page)).toEqual({ open: 'open: yes', count: 'count: 2' });
	await page.click('#count');
	await expect.poll(() => read(page)).toEqual({ open: 'open: yes', count: 'count: 3' });
	await page.goBack();
	await title(page, 'Home');
	expect(await read(page)).toEqual({ open: 'open: yes', count: 'count: 3' });
	expect(errors).toEqual([]);
	await page.close();
});

test('a document that reads shared() is refused with a message naming it, not served with a value that never follows', async () => {
	const response = await fetch(`${servers.document!.origin}/`);
	expect(response.status).toBe(500);
	expect(await response.text()).toContain(
		'MARKLESS_ROUTER_DOCUMENT_SHARED_UNSUPPORTED: the document reads shared() ui',
	);
});
