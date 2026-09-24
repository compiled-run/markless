import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { chromium, type Page } from '@playwright/test';
import { resolve } from 'pathe';
import { afterAll, describe, expect, test } from 'vitest';

const exec = promisify(execFile);
const fixtures = resolve(import.meta.dirname, '../fixtures');
const buildScript = resolve(import.meta.dirname, 'helpers/build-packing-fixture.ts');
const outRoots: string[] = [];
afterAll(() => Promise.all(outRoots.map((path) => rm(path, { force: true, recursive: true }))));

type Variant = {
	readonly name: string;
	readonly port: number;
	readonly interact: (page: Page) => Promise<void>;
};

const variants: readonly Variant[] = [
	{
		name: 'vite-ssr',
		port: 4346,
		async interact(page) {
			const counter = page.locator('button[data-counter]');
			await expect.poll(() => counter.textContent()).toBe('0');
			await counter.click();
			await expect.poll(() => counter.textContent()).toBe('1');
		},
	},
	{
		name: 'vite-ssr-rows',
		port: 4347,
		async interact(page) {
			const output = page.locator('main > output');
			await expect.poll(() => output.textContent()).toBe('none');
			await page.locator('main > section > article:nth-of-type(2) button').click();
			await expect.poll(() => output.textContent()).toBe('beta');
			await page.locator('main > section > article:nth-of-type(1) button').click();
			await expect.poll(() => output.textContent()).toBe('alpha');
		},
	},
	{
		name: 'vite-prerender-multi-child',
		port: 4348,
		async interact(page) {
			const left = page.locator('[data-counter-side="left"]');
			const right = page.locator('[data-counter-side="right"]');
			await expect.poll(() => left.textContent()).toBe('0');
			await page.locator('[data-left-increment]').click();
			await page.locator('[data-right-increment]').click();
			await expect.poll(() => left.textContent()).toBe('1');
			await expect.poll(() => right.textContent()).toBe('12');
		},
	},
];

describe('native packing without router route sources', () => {
	for (const variant of variants) {
		test(`${variant.name} builds packed and resumes clicks`, async () => {
			const unpacked = await buildAndClick(variant, false);
			const packed = await buildAndClick(variant, true);
			console.info(
				`${variant.name} script traffic, packing off -> on: load ${unpacked.load.requests} req/${unpacked.load.bytes} B -> ${packed.load.requests} req/${packed.load.bytes} B; interaction ${unpacked.interaction.requests} req/${unpacked.interaction.bytes} B -> ${packed.interaction.requests} req/${packed.interaction.bytes} B`,
			);
			expect(unpacked.errors).toEqual([]);
			expect(packed.errors).toEqual([]);
			expect(packed.interaction.requests).toBeLessThanOrEqual(unpacked.interaction.requests);
		}, 180_000);
	}
});

type ScriptTraffic = { requests: number; bytes: number };

async function buildAndClick(variant: Variant, packed: boolean) {
	// Under the fixture's node_modules so built server chunks resolve its @markless packages.
	const dist = resolve(
		fixtures,
		variant.name,
		'node_modules/.markless-packing',
		packed ? 'packed' : 'unpacked',
	);
	outRoots.push(dist);
	try {
		await exec(process.execPath, [buildScript, variant.name, dist, String(variant.port)], {
			cwd: resolve(fixtures, variant.name),
			env: { ...process.env, MARKLESS_FIXTURE_NATIVE_PACKING: packed ? '1' : '0' },
		});
	} catch (error) {
		const failure = error as Error & { stderr?: string };
		throw new Error(
			`${variant.name} ${packed ? 'packed' : 'unpacked'} build failed:\n${failure.stderr ?? failure.message}`,
		);
	}

	const server = createServer(async (request, response) => {
		const path = new URL(request.url ?? '/', 'http://fixture.local').pathname;
		try {
			const body = await readFile(resolve(dist, `.${path === '/' ? '/index.html' : path}`));
			response.setHeader(
				'Content-Type',
				path.endsWith('.js') ? 'text/javascript' : 'text/html;charset=utf-8',
			);
			response.end(body);
		} catch {
			response.statusCode = 404;
			response.end();
		}
	});
	await new Promise<void>((done) => server.listen(variant.port, '127.0.0.1', done));
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		const scripts: Promise<number>[] = [];
		page.on('response', (response) => {
			if (response.request().resourceType() !== 'script') return;
			scripts.push(
				response.body().then(
					(body) => body.byteLength,
					() => 0,
				),
			);
		});
		await page.goto(`http://127.0.0.1:${variant.port}/`);
		await page.waitForLoadState('networkidle');
		const atLoad = scripts.length;
		await variant.interact(page).catch((error: Error) => {
			throw new Error(
				`${variant.name} ${packed ? 'packed' : 'unpacked'}: ${error.message}\npage errors: ${errors.join('\n')}`,
			);
		});
		await page.waitForLoadState('networkidle');
		const traffic = async (from: number, to: number): Promise<ScriptTraffic> => ({
			requests: to - from,
			bytes: (await Promise.all(scripts.slice(from, to))).reduce(
				(sum, bytes) => sum + bytes,
				0,
			),
		});
		return {
			errors,
			load: await traffic(0, atLoad),
			interaction: await traffic(atLoad, scripts.length),
		};
	} finally {
		await browser.close();
		await new Promise((done) => server.close(done));
	}
}
