import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium, type Page } from '@playwright/test';
import { resolve } from 'pathe';
import { expect, test } from 'vitest';
import { listenOnFreePort } from './helpers/listen.ts';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const fixture = resolve(root, 'packages/bundler/fixtures/vite-ssr-updates');
const dist = resolve(fixture, 'dist');
let port = 0;

function snapshot(page: Page) {
	return page.evaluate(() => ({
		rows: [...document.querySelectorAll('li')].map(
			(row) =>
				`${row.dataset.id}:${row.title}:${row.querySelector('span')?.textContent}:${row.dataset.picked}`,
		),
		focused: document.activeElement?.closest('li')?.dataset.id ?? null,
		save: (document.getElementById('save') as HTMLButtonElement).disabled,
		tab: document.getElementById('tab-second')!.getAttribute('aria-selected'),
		multi: document.getElementById('multi')!.textContent,
	}));
}

test('served rows and bindings update after resume', async () => {
	await rm(dist, { force: true, recursive: true });
	await exec(resolve(root, 'node_modules/.bin/vp'), ['build', '--app'], { cwd: fixture });

	const entry = (await import(
		`${pathToFileURL(resolve(dist, 'server-render/server.js')).href}?test=${Date.now()}`
	)) as { render(): Promise<string> };
	const html = `<!doctype html><html><body>${await entry.render()}</body></html>`;

	const server = createServer(async (request, response) => {
		const path = new URL(request.url ?? '/', 'http://fixture.local').pathname;
		if (path === '/') {
			response.setHeader('Content-Type', 'text/html;charset=utf-8');
			response.end(html);
			return;
		}
		try {
			const source = await readFile(resolve(dist, `.${path}`));
			response.setHeader('Content-Type', 'text/javascript');
			response.end(source);
		} catch {
			response.statusCode = 404;
			response.end();
		}
	});
	port = await listenOnFreePort(server);
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(`http://127.0.0.1:${port}/`);
		expect(await snapshot(page)).toEqual({
			rows: ['a:Row Alpha:ALPHA:no', 'b:Row Beta:BETA:no'],
			focused: null,
			save: false,
			tab: 'false',
			multi: '1|2|3',
		});

		await page.click('#clear-draft');
		await expect.poll(async () => (await snapshot(page)).save).toBe(true);

		await page.click('#tab-second');
		await expect.poll(async () => (await snapshot(page)).tab).toBe('true');

		await page.click('#bump');
		await expect.poll(async () => (await snapshot(page)).multi).toBe('2|3|4');

		await page.click('li[data-id="b"] .rename');
		await expect
			.poll(async () => (await snapshot(page)).rows)
			.toEqual(['a:Row Alpha:ALPHA:no', 'b:Row Beta!:BETA!:no']);
		expect((await snapshot(page)).focused).toBe('b');

		await page.click('#replace');
		await expect
			.poll(async () => (await snapshot(page)).rows)
			.toEqual(['c:Row Gamma:GAMMA:no', 'b:Row Beta!:BETA!:no']);

		await page.click('#pick-b');
		await expect
			.poll(async () => (await snapshot(page)).rows)
			.toEqual(['c:Row Gamma:GAMMA:no', 'b:Row Beta!:BETA!:yes']);

		await page.click('li[data-id="b"] .rename');
		await expect
			.poll(async () => (await snapshot(page)).rows)
			.toEqual(['c:Row Gamma:GAMMA:no', 'b:Row Beta!!:BETA!!:yes']);
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
		await new Promise<void>((done) => server.close(() => done()));
	}
}, 120_000);
