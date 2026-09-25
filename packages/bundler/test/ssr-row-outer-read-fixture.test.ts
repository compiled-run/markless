import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium, type Page } from '@playwright/test';
import { resolve } from 'pathe';
import { afterEach, describe, expect, test } from 'vitest';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const fixture = resolve(import.meta.dirname, 'fixtures/vite-ssr-row-outer-read');
const dist = resolve(fixture, 'dist');
let server: Server | undefined;

afterEach(async () => {
	await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
	server = undefined;
});

async function buildAndServe(env: Record<string, string>): Promise<string> {
	await rm(dist, { force: true, recursive: true });
	await exec(resolve(root, 'node_modules/.bin/vp'), ['build', '--app'], {
		cwd: fixture,
		env: { ...process.env, ...env },
	});
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
	await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done));
	return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

function rows(page: Page) {
	return page.evaluate(() =>
		[...document.querySelectorAll('li')].map((row) => {
			const state = row.classList.contains('chosen') ? 'chosen' : row.classList.contains('idle') ? 'idle' : '?';
			return `${row.dataset.slug}:${state}:${row.querySelector('.flag')?.textContent}:${row.querySelector('.mark')?.textContent}`;
		}),
	);
}

// The scoped module's class stays on every row, served or rebuilt.
function rowsKeepScope(page: Page) {
	return page.evaluate(() =>
		[...document.querySelectorAll('li')].every((row) => row.classList.length === 2),
	);
}

// Row markup reading page state outside the @for follows writes to it, whichever handler wrote it.
async function exerciseOuterReads(url: string, ready: (page: Page) => Promise<void>) {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(url);
		await ready(page);
		expect(await rows(page)).toEqual(['a:idle:off:', 'b:idle:off:', 'c:idle:off:']);

		await page.click('li[data-slug="b"] .choose');
		await expect.poll(() => page.textContent('#chosen')).toBe('b');
		await expect.poll(() => rows(page)).toEqual(['a:idle:off:B', 'b:chosen:on:B', 'c:idle:off:B']);

		await page.click('#choose-c');
		await expect.poll(() => rows(page)).toEqual(['a:idle:off:C', 'b:idle:off:C', 'c:chosen:on:C']);

		await page.click('#append');
		await expect
			.poll(() => rows(page))
			.toEqual(['a:idle:off:C', 'b:idle:off:C', 'c:chosen:on:C', 'd:idle:off:C']);
		await page.click('li[data-slug="d"] .choose');
		await expect
			.poll(() => rows(page))
			.toEqual(['a:idle:off:D', 'b:idle:off:D', 'c:idle:off:D', 'd:chosen:on:D']);
		expect(await rowsKeepScope(page)).toBe(true);
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
	}
}

for (const [label, env] of [
	['packed', {}],
	['unpacked', { ROW_OUTER_UNPACKED: '1' }],
] as const) {
	describe(`row bindings reading outer state (${label})`, () => {
		test('follow writes after SSR resume and in a client render', async () => {
			const url = await buildAndServe(env);
			await exerciseOuterReads(`${url}/`, async () => {});
			await exerciseOuterReads(`${url}/csr.html`, (page) =>
				page.waitForSelector('body[data-ready="true"]').then(() => undefined),
			);
		}, 180_000);
	});
}
