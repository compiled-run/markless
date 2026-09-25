import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { resolve } from 'pathe';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { listenOnFreePort } from './helpers/listen.ts';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const fixture = resolve(root, 'packages/bundler/fixtures/vite-ssr-body-local-rows');
const dist = resolve(fixture, 'dist');
let port = 0;
let server: ReturnType<typeof createServer> | undefined;

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
			response.setHeader('Content-Type', 'text/javascript');
			response.end(await readFile(resolve(dist, `.${path}`)));
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

test('rows over a body-local collection wire every handler, and a computed over it re-derives', async () => {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(`http://127.0.0.1:${port}/`);
		const summaries = () => page.locator('.summary').allTextContents();
		expect(await summaries()).toEqual(['Maps: none (0)', 'Poetry: none (0)']);

		await page.click('[data-isbn="m3"]');
		await expect.poll(summaries).toEqual(['Maps: Globes (1)', 'Poetry: none (0)']);
		await page.click('[data-isbn="p2"]');
		await expect.poll(summaries).toEqual(['Maps: Globes (1)', 'Poetry: Sonnets (1)']);
		await page.click('[data-isbn="m1"]');
		await page.click('[data-isbn="p1"]');
		await expect.poll(summaries).toEqual(['Maps: Atlas (2)', 'Poetry: Odes (2)']);
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
	}
}, 60_000);
