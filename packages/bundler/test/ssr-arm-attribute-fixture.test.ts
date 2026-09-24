import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readdir, readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium, type Page } from '@playwright/test';
import { resolve } from 'pathe';
import { afterAll, beforeAll, expect, test } from 'vitest';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const fixture = resolve(root, 'packages/bundler/fixtures/vite-ssr-arm-attribute');
const dist = resolve(fixture, 'dist');
const port = 4331;
let server: ReturnType<typeof createServer> | undefined;

function note(page: Page) {
	return page.evaluate(() => {
		const input = document.querySelector<HTMLInputElement>('#draft');
		return input
			? {
					value: input.value,
					title: input.getAttribute('title'),
					echo: document.querySelector('#echo')?.textContent ?? null,
				}
			: null;
	});
}

beforeAll(async () => {
	await rm(dist, { force: true, recursive: true });
	await exec(resolve(root, 'node_modules/.bin/vp'), ['build', '--app'], { cwd: fixture });

	const buildDir = resolve(dist, 'build');
	let resumeModuleUrl: string | undefined;
	for (const file of await readdir(buildDir))
		if (
			file.endsWith('.js') &&
			(await readFile(resolve(buildDir, file), 'utf8')).includes('resumeContainerEvent')
		)
			resumeModuleUrl = `/build/${file}`;
	expect(resumeModuleUrl).toBeDefined();
	const entry = (await import(
		`${pathToFileURL(resolve(dist, 'server-render/server.js')).href}?test=${Date.now()}`
	)) as { render(options: { resumeModuleUrl?: string }): Promise<string> };
	const html = `<!doctype html><html><body>${await entry.render({ resumeModuleUrl })}</body></html>`;

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
afterAll(async () => {
	await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
});

async function exerciseArmAttribute(url: string, ready: (page: Page) => Promise<void>) {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(url);
		await ready(page);
		expect(await note(page)).toBeNull();

		await page.click('#fresh');
		await expect.poll(() => note(page)).toEqual({ value: '', title: '', echo: 'Draft: ' });
		await page.click('#draft');
		await page.keyboard.type('hello');
		await expect.poll(() => note(page)).toEqual({ value: 'hello', title: 'hello', echo: 'Draft: hello' });

		// Reopening without clearing rebuilds the input from the value it had.
		await page.click('#peek');
		await expect.poll(() => note(page)).toBeNull();
		await page.click('#peek');
		await expect.poll(() => note(page)).toEqual({ value: 'hello', title: 'hello', echo: 'Draft: hello' });

		// A write while the rebuilt arm is shown still reaches its attribute bindings.
		await page.click('#fill');
		const filled = 'from "fill" & <co>';
		await expect.poll(() => note(page)).toEqual({ value: filled, title: filled, echo: `Draft: ${filled}` });
		await page.click('#peek');
		await page.click('#peek');
		await expect.poll(() => note(page)).toEqual({ value: filled, title: filled, echo: `Draft: ${filled}` });

		// Clear on open: close, reopen, and the field starts empty.
		await page.click('#fresh');
		await expect.poll(() => note(page)).toBeNull();
		await page.click('#fresh');
		await expect.poll(() => note(page)).toEqual({ value: '', title: '', echo: 'Draft: ' });
		await page.click('#draft');
		await page.keyboard.type('again');
		await expect.poll(() => note(page)).toEqual({ value: 'again', title: 'again', echo: 'Draft: again' });
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
	}
}

test('an attribute binding inside a shown @if rebuilds and updates after SSR resume', async () => {
	await exerciseArmAttribute(`http://127.0.0.1:${port}/`, async () => {});
}, 60_000);

test('an attribute binding inside a shown @if rebuilds and updates in a client render', async () => {
	await exerciseArmAttribute(`http://127.0.0.1:${port}/csr.html`, (page) =>
		page.waitForSelector('body[data-ready="true"]').then(() => undefined),
	);
}, 60_000);
