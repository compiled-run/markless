import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readdir, readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { resolve } from 'pathe';
import { expect, test } from 'vitest';
import { resumeModuleClosure, servedResumeModuleUrl } from './helpers/served-resume-module.ts';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const fixture = resolve(root, 'packages/bundler/fixtures/vite-ssr-scalar-wake');
const dist = resolve(fixture, 'dist');
const port = 4356;

// A non-scalar click wakes the full runtime, which adopts the lean click's value
// and then owns the cells: a specialized scalar click that kept its own copy
// would leave the runtime a stale value.
// Unpacked, the full runtime is its own chunk, so staying lean means never fetching it. Packed,
// that code rides the page's preloaded pack, so staying lean means never starting it.
test.each([false, true])(
	'specialized scalar clicks after a hover wake write the live runtime state (packing: %s)',
	async (packing) => {
		await rm(dist, { force: true, recursive: true });
		await exec(resolve(root, 'node_modules/.bin/vp'), ['build', '--app'], {
			cwd: fixture,
			env: { ...process.env, MARKLESS_FIXTURE_NATIVE_PACKING: packing ? '1' : '0' },
		});

		const fullResumeChunks = new Set<string>();
		if (!packing) {
			const buildDir = resolve(dist, 'build');
			for (const file of await readdir(buildDir)) {
				if (!file.endsWith('.js')) continue;
				const source = await readFile(resolve(buildDir, file), 'utf8');
				if (/export\{[^}]*resumeFromPayloadDocument/.test(source))
					fullResumeChunks.add(`/build/${file}`);
			}
			expect(fullResumeChunks.size).toBe(1);
		}

		const entry = (await import(
			`${pathToFileURL(resolve(dist, 'server-render/server.js')).href}?test=${Date.now()}`
		)) as { render(): Promise<string> };
		const body = await entry.render();
		const resume = await resumeModuleClosure(dist, servedResumeModuleUrl(body));
		expect(resume.source).toContain('MARKLESS_SCALAR_SPECIALIZED_ESCALATE');
		expect(resume.source).toContain('__marklessEventOnlyGraph');
		const html = `<!doctype html><html><head></head><body>${body}</body></html>`;

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
		try {
			const page = await browser.newPage();
			const scripts: string[] = [];
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			page.on('request', (request) => {
				if (request.resourceType() === 'script')
					scripts.push(new URL(request.url()).pathname);
			});
			const total = () => page.locator('output').textContent();
			const fullStarted = () =>
				page.evaluate(
					() =>
						(
							document.querySelector('[data-async-container]') as {
								__asyncResumeRuntimeStarted?: boolean;
							} | null
						)?.__asyncResumeRuntimeStarted === true,
				);
			const fullRuntime = async () =>
				packing ? fullStarted() : scripts.some((url) => fullResumeChunks.has(url));

			await page.goto(`http://127.0.0.1:${port}/`);
			await expect.poll(total).toBe('0');
			expect(await fullRuntime()).toBe(false);

			// Hovering and clicking the scalar control stays lean: no full runtime.
			await page.locator('[data-step]').hover();
			await page.locator('[data-step]').click();
			await expect.poll(total).toBe('1');
			await page.waitForTimeout(200);
			expect(await fullRuntime()).toBe(false);

			// The non-scalar control wakes the full runtime, which adopts the lean value.
			await page.locator('[data-jump]').click();
			await expect.poll(total).toBe('11');
			if (!packing)
				await expect
					.poll(() => scripts.filter((url) => fullResumeChunks.has(url)).length)
					.toBe(1);
			await expect.poll(fullStarted).toBe(true);
			await page.waitForTimeout(200);

			await page.locator('[data-step]').click();
			await expect.poll(total).toBe('12');
			await page.locator('[data-jump]').click();
			await expect.poll(total).toBe('22');
			await page.locator('[data-step]').click();
			await expect.poll(total).toBe('23');
			await page.waitForTimeout(200);
			expect(await total()).toBe('23');
			expect(errors).toEqual([]);
		} finally {
			await browser.close();
			await new Promise((done) => server.close(done));
		}
	},
	120_000,
);
