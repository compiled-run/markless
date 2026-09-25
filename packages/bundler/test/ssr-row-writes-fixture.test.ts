import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium, type Page } from '@playwright/test';
import { resolve } from 'pathe';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { listenOnFreePort } from './helpers/listen.ts';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const fixture = resolve(root, 'packages/bundler/fixtures/vite-ssr-row-writes');
const dist = resolve(fixture, 'dist');
let port = 0;
let server: ReturnType<typeof createServer> | undefined;

function rows(page: Page) {
	return page.evaluate(() =>
		[...document.querySelectorAll('li')].map(
			(row) =>
				`${row.dataset.slug}:${row.dataset.done}:${row.querySelector('.hits')?.textContent}`,
		),
	);
}

// Tags every row element so a later check can tell a kept node from a rebuilt one.
function tagRows(page: Page) {
	return page.evaluate(() => {
		for (const row of document.querySelectorAll('li'))
			(row as HTMLElement & { __tag?: string }).__tag = row.dataset.slug;
	});
}

function taggedRows(page: Page) {
	return page.evaluate(() =>
		[...document.querySelectorAll('li')].map(
			(row) => (row as HTMLElement & { __tag?: string }).__tag ?? null,
		),
	);
}

function focusedRow(page: Page) {
	return page.evaluate(() => ({
		slug: document.activeElement?.closest('li')?.getAttribute('data-slug') ?? null,
		className: document.activeElement?.className ?? null,
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
	port = await listenOnFreePort(server!);
}, 120_000);

afterAll(async () => {
	await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
});

async function exerciseRowWrites(url: string, ready: (page: Page) => Promise<void>) {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(url);
		await ready(page);
		expect(await rows(page)).toEqual(['a:no:0', 'b:no:0', 'c:no:0']);
		await tagRows(page);

		await page.click('li[data-slug="b"] .toggle');
		await expect.poll(() => rows(page)).toEqual(['a:no:0', 'b:yes:0', 'c:no:0']);
		const tags = await taggedRows(page);
		expect([tags[0], tags[2]]).toEqual(['a', 'c']);
		expect(await focusedRow(page)).toEqual({ slug: 'b', className: 'toggle' });

		await page.click('li[data-slug="b"] .hit');
		await page.click('li[data-slug="b"] .hit');
		await expect.poll(() => rows(page)).toEqual(['a:no:0', 'b:yes:2', 'c:no:0']);

		await page.click('#reverse');
		await expect.poll(() => rows(page)).toEqual(['c:no:0', 'b:yes:2', 'a:no:0']);

		// After the reorder the write still lands on the row's own item, not its old slot.
		await page.click('li[data-slug="c"] .toggle');
		await expect.poll(() => rows(page)).toEqual(['c:yes:0', 'b:yes:2', 'a:no:0']);
		await page.click('li[data-slug="b"] .toggle');
		await expect.poll(() => rows(page)).toEqual(['c:yes:0', 'b:no:2', 'a:no:0']);
		expect(await focusedRow(page)).toEqual({ slug: 'b', className: 'toggle' });
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
	}
}

test('a write through a keyed row item updates only that row after SSR resume', async () => {
	await exerciseRowWrites(`http://127.0.0.1:${port}/`, async () => {});
}, 60_000);

test('a write through a keyed row item updates only that row in a client render', async () => {
	await exerciseRowWrites(`http://127.0.0.1:${port}/csr.html`, (page) =>
		page.waitForSelector('body[data-ready="true"]').then(() => undefined),
	);
}, 60_000);
