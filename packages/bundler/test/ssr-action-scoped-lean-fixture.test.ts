import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readdir, readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium, type Page } from '@playwright/test';
import { resolve } from 'pathe';
import { expect, test } from 'vitest';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const fixture = resolve(root, 'packages/bundler/fixtures/vite-ssr-action-scoped-lean');
const dist = resolve(fixture, 'dist');
const port = 4292;

// A page whose branch and element handle need the full runtime still runs its
// unrelated scalar counter lean; the full runtime boots on the first action that
// needs it and adopts the counter's live value.
test('scalar actions stay lean beside full-resume records until an action needs the runtime', async () => {
	await rm(dist, { force: true, recursive: true });
	await exec(resolve(root, 'node_modules/.bin/vp'), ['build', '--app'], { cwd: fixture });

	const buildDir = resolve(dist, 'build');
	let resumeModuleUrl: string | undefined;
	const fullResumeChunks = new Set<string>();
	for (const file of await readdir(buildDir)) {
		if (!file.endsWith('.js')) continue;
		const source = await readFile(resolve(buildDir, file), 'utf8');
		if (source.includes('resumeContainerEvent')) resumeModuleUrl = `/build/${file}`;
		if (/export\{[^}]*resumeFromPayloadDocument/.test(source))
			fullResumeChunks.add(`/build/${file}`);
	}
	expect(resumeModuleUrl).toBeDefined();
	expect(fullResumeChunks.size).toBe(1);

	const entry = (await import(
		`${pathToFileURL(resolve(dist, 'server-render/server.js')).href}?test=${Date.now()}`
	)) as { render(options: { resumeModuleUrl?: string }): Promise<string> };
	const html = `<!doctype html><html><head></head><body>${await entry.render({ resumeModuleUrl })}</body></html>`;
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
	await new Promise<void>((done) => server.listen(port, '127.0.0.1', done));
	const browser = await chromium.launch();
	const open = async () => {
		const page = await browser.newPage();
		const scripts: string[] = [];
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('request', (request) => {
			if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname);
		});
		await page.goto(`http://127.0.0.1:${port}/`);
		await expect.poll(() => text(page, '[data-taps]')).toBe('0');
		return {
			page,
			errors,
			fullFetched: () => scripts.some((url) => fullResumeChunks.has(url)),
			fullStarted: () =>
				page.evaluate(
					() =>
						(
							document.querySelector('[data-async-container]') as {
								__asyncResumeRuntimeStarted?: boolean;
							} | null
						)?.__asyncResumeRuntimeStarted === true,
				),
		};
	};
	try {
		// Queued rapid clicks stay lean, then the branch control boots the full
		// runtime, which carries the counter's value forward.
		const lean = await open();
		await lean.page.locator('[data-tap]').hover();
		await lean.page.evaluate(() => {
			const tap = document.querySelector<HTMLButtonElement>('[data-tap]')!;
			tap.click();
			tap.click();
			tap.click();
		});
		await expect.poll(() => text(lean.page, '[data-taps]')).toBe('3');
		await lean.page.waitForTimeout(200);
		expect(lean.fullFetched()).toBe(false);
		expect(await lean.fullStarted()).toBe(false);
		await lean.page.locator('[data-toggle]').click();
		await expect.poll(() => lean.page.locator('[data-shown]').count()).toBe(1);
		expect(lean.fullFetched()).toBe(true);
		await lean.page.locator('[data-tap]').click();
		await expect.poll(() => text(lean.page, '[data-taps]')).toBe('4');
		await lean.page.locator('[data-toggle]').click();
		await expect.poll(() => lean.page.locator('[data-shown]').count()).toBe(0);
		expect(await text(lean.page, '[data-taps]')).toBe('4');
		expect(lean.errors).toEqual([]);

		// Keyboard activation and focus on the lean control stay lean.
		const keyboard = await open();
		await keyboard.page.locator('[data-tap]').focus();
		await keyboard.page.keyboard.press('Enter');
		await expect.poll(() => text(keyboard.page, '[data-taps]')).toBe('1');
		await keyboard.page.keyboard.press('Space');
		await expect.poll(() => text(keyboard.page, '[data-taps]')).toBe('2');
		await keyboard.page.waitForTimeout(200);
		expect(keyboard.fullFetched()).toBe(false);
		expect(keyboard.errors).toEqual([]);

		// A scalar handler with a markless ancestor handler on the same path runs
		// both through full resume.
		const nested = await open();
		await nested.page.locator('[data-pick]').click();
		await expect.poll(() => text(nested.page, '[data-picks]')).toBe('1');
		await expect.poll(() => text(nested.page, '[data-marks]')).toBe('1');
		expect(nested.fullFetched()).toBe(true);
		await nested.page.locator('[data-marks]').click();
		await expect.poll(() => text(nested.page, '[data-marks]')).toBe('2');
		expect(await text(nested.page, '[data-picks]')).toBe('1');
		expect(nested.errors).toEqual([]);

		// Lean clicks queued behind a pending full start are dispatched by the runtime.
		const pending = await open();
		await pending.page.evaluate(() => {
			document.querySelector<HTMLButtonElement>('[data-tap]')!.click();
			document.querySelector<HTMLButtonElement>('[data-toggle]')!.click();
			document.querySelector<HTMLButtonElement>('[data-tap]')!.click();
			document.querySelector<HTMLButtonElement>('[data-tap]')!.click();
		});
		await expect.poll(() => pending.page.locator('[data-shown]').count()).toBe(1);
		await expect.poll(() => text(pending.page, '[data-taps]')).toBe('3');
		await pending.page.waitForTimeout(200);
		expect(await text(pending.page, '[data-taps]')).toBe('3');
		expect(pending.errors).toEqual([]);
	} finally {
		await browser.close();
		await new Promise((done) => server.close(done));
	}
}, 180_000);

function text(page: Page, selector: string) {
	return page.locator(selector).textContent();
}
