import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { readdir, readFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { chromium, type Route } from '@playwright/test';
import { resolve } from 'pathe';
import { expect, test } from 'vitest';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const fixture = resolve(import.meta.dirname, 'fixtures/stream-adoption-race');
const dist = resolve(fixture, 'dist');

// An early click wakes the runtime while the page is still streaming, and the
// code that adopts streamed arms is still downloading when the settled arm
// streams in. The runtime must adopt exactly the arm the DOM shows, never the
// settled records over a range that still shows @pending.
test.each([false, true])(
	'a streamed arm that lands while the adoption code downloads stays consistent (packing: %s)',
	async (packing) => {
		await rm(dist, { force: true, recursive: true });
		await exec(resolve(root, 'node_modules/.bin/vp'), ['build', '--app'], {
			cwd: fixture,
			env: { ...process.env, MARKLESS_FIXTURE_NATIVE_PACKING: packing ? '1' : '0' },
		});

		const adoptionChunks = new Set<string>();
		for (const file of await readdir(resolve(dist, 'build'))) {
			if (!file.endsWith('.js')) continue;
			const source = await readFile(resolve(dist, 'build', file), 'utf8');
			if (source.includes('markless/state-patch')) adoptionChunks.add(`/build/${file}`);
		}
		expect(adoptionChunks.size).toBeGreaterThan(0);

		const server = spawn(process.execPath, [resolve(fixture, 'serve.mjs'), dist], {
			stdio: ['ignore', 'pipe', 'inherit'],
		});
		const [port] = (await once(server.stdout, 'data')) as [Buffer];
		const origin = `http://127.0.0.1:${String(port).trim()}`;
		const browser = await chromium.launch();
		try {
			const page = await browser.newPage();
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			page.on('console', (message) => {
				if (message.type() === 'error') errors.push(message.text());
			});
			const held: Route[] = [];
			const release = Promise.withResolvers<void>();
			await page.route(`${origin}/build/**`, async (route) => {
				if (!adoptionChunks.has(new URL(route.request().url()).pathname))
					return route.continue();
				held.push(route);
				await release.promise;
				await route.continue();
			});
			const runtimeStarted = () =>
				page.evaluate(
					() =>
						(
							document.querySelector('[data-async-container]') as {
								__asyncResumeRuntimeStarted?: boolean;
							} | null
						)?.__asyncResumeRuntimeStarted === true,
				);

			await page.goto(`${origin}/`, { waitUntil: 'commit' });
			await page.locator('p.waiting').waitFor();
			await page.locator('[data-bump]').click();
			// Packed, the handoff that marks the runtime started rides the held pack itself.
			if (packing) await expect.poll(() => held.length).toBeGreaterThan(0);
			else await expect.poll(runtimeStarted).toBe(true);

			expect(await (await fetch(`${origin}/__settle`)).text()).toBe('streamed');
			await page.waitForTimeout(500);
			release.resolve();

			await expect.poll(() => page.locator('output').textContent()).toBe('1');
			await expect
				.poll(() => page.locator('[data-cheer]').textContent(), { timeout: 5_000 })
				.toBe('Harbor open');
			expect(await page.locator('p.waiting').count()).toBe(0);
			await page.locator('[data-cheer]').click();
			await expect.poll(() => page.locator('[data-cheers]').textContent()).toBe('1');
			await expect.poll(() => page.locator('[data-arm-cheers]').textContent()).toBe('1');
			await page.locator('[data-bump]').click();
			await expect.poll(() => page.locator('output').textContent()).toBe('2');
			await page.locator('[data-tide]').click();
			await expect
				.poll(() => page.locator('[data-cheer]').textContent(), { timeout: 5_000 })
				.toBe('Harbor busy');
			await page.locator('[data-cheer]').click();
			await expect.poll(() => page.locator('[data-cheers]').textContent()).toBe('2');
			await expect.poll(() => page.locator('[data-arm-cheers]').textContent()).toBe('2');
			expect(errors).toEqual([]);
		} finally {
			await browser.close();
			server.kill();
		}
	},
	120_000,
);
