import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium, type Page } from '@playwright/test';
import { resolve } from 'pathe';
import { afterAll, beforeAll, expect, test } from 'vitest';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const fixture = resolve(root, 'packages/bundler/fixtures/vite-ssr-imported-rows');
const dist = resolve(fixture, 'dist');
const port = 4306;
let server: ReturnType<typeof createServer> | undefined;

function view(page: Page) {
	return page.evaluate(() => ({
		...Object.fromEntries(
			[...document.querySelectorAll('section.picker')].map((picker) => [
				picker.getAttribute('data-entry'),
				[...picker.querySelectorAll('li.pick')].map(
					(row) => `${row.getAttribute('data-id')}=${row.textContent?.trim()}`,
				),
			]),
		),
		size: document.querySelector('.size-said')?.textContent ?? '',
	}));
}

beforeAll(async () => {
	await rm(dist, { force: true, recursive: true });
	await exec(resolve(root, 'node_modules/.bin/vp'), ['build', '--app'], { cwd: fixture });

	const entry = (await import(
		`${pathToFileURL(resolve(dist, 'server-render/server.js')).href}?test=${Date.now()}`
	)) as { render(): Promise<string> };
	const html = `<!doctype html><html><body>${await entry.render()}</body></html>`;

	server = createServer(async (request, response) => {
		const path = new URL(request.url ?? '/', 'http://fixture.local').pathname;
		if (path === '/') {
			response.setHeader('Content-Type', 'text/html;charset=utf-8');
			response.end(html);
			return;
		}
		try {
			const source = await readFile(resolve(dist, `.${path}`));
			response.setHeader(
				'Content-Type',
				path.endsWith('.html') ? 'text/html;charset=utf-8' : 'text/javascript',
			);
			response.end(source);
		} catch {
			response.statusCode = 404;
			response.end();
		}
	});
	await new Promise<void>((done) => server!.listen(port, '127.0.0.1', done));
}, 120_000);

afterAll(async () => {
	await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
});

async function exerciseImportedRows(url: string, ready: (page: Page) => Promise<void>) {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(url);
		await ready(page);
		expect(await view(page)).toEqual({ fruit: [], veg: [], size: 'none' });

		await page.click('section[data-entry="fruit"] .pick-last');
		await expect
			.poll(() => view(page))
			.toEqual({ fruit: ['pear=pick/Pear'], veg: [], size: 'none' });

		await page.click('section[data-entry="veg"] .retag');
		await page.click('section[data-entry="veg"] .pick-last');
		await expect
			.poll(() => view(page))
			.toEqual({ fruit: ['pear=pick/Pear'], veg: ['leek=got/Leek'], size: 'none' });

		await page.click('section[data-entry="fruit"] .retag');
		await expect
			.poll(() => view(page))
			.toEqual({ fruit: ['pear=got/Pear'], veg: ['leek=got/Leek'], size: 'none' });
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
	}
}

async function exerciseConstantRows(url: string, ready: (page: Page) => Promise<void>) {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(url);
		await ready(page);

		await page.click('section[data-entry="veg"] button.choice[data-choice="kale"]');
		await page.click('section[data-entry="fruit"] button.choice[data-choice="pear"]');
		await page.click('section[data-entry="fruit"] button.choice[data-choice="apple"]');
		await expect
			.poll(() => view(page))
			.toEqual({
				fruit: ['pear=pick/Pear', 'apple=pick/Apple'],
				veg: ['kale=pick/Kale'],
				size: 'none',
			});

		await page.click('button.size[data-size="large"]');
		await expect.poll(() => view(page)).toMatchObject({ size: 'Large' });
		await page.click('button.size[data-size="small"]');
		await expect.poll(() => view(page)).toMatchObject({ size: 'Small' });
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
	}
}

const csrReady = (page: Page) =>
	page.waitForSelector('body[data-ready="true"]').then(() => undefined);

test('expression-slot rows in an imported child build after SSR resume', async () => {
	await exerciseImportedRows(`http://127.0.0.1:${port}/`, async () => {});
}, 60_000);

test('expression-slot rows in an imported child build in a client render', async () => {
	await exerciseImportedRows(`http://127.0.0.1:${port}/csr.html`, csrReady);
}, 60_000);

test('handlers on rows over a constant collection run after SSR resume', async () => {
	await exerciseConstantRows(`http://127.0.0.1:${port}/`, async () => {});
}, 60_000);

test('handlers on rows over a constant collection run in a client render', async () => {
	await exerciseConstantRows(`http://127.0.0.1:${port}/csr.html`, csrReady);
}, 60_000);
