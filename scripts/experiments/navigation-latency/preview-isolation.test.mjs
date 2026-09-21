import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import net from 'node:net';
import {
	readBuildInventory,
	verifyServedAsset,
	captureApplicationJavaScript,
	validateCapture,
	launchProductionPreview,
	assertPortAvailable,
	devLaunchArgs,
} from './production-preview.mjs';
import { LINK_ATTRIBUTE } from '../../../packages/router/src/link-attributes.ts';

const before = resolve(process.env.NAVIGATION_PREVIEW_BEFORE);
const after = resolve(process.env.NAVIGATION_PREVIEW_AFTER);
const output = resolve(process.env.NAVIGATION_PREVIEW_RESULTS);
const run = resolve(output, 'test-' + Date.now());
await mkdir(run, { recursive: true });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function start(buildDir, label) {
	const folder = resolve(run, label);
	await mkdir(folder);
	await writeFile(
		resolve(folder, 'build-complete.json'),
		await readFile(resolve(buildDir, 'build-complete.json')),
	);
	const child = spawn(
		process.execPath,
		[
			resolve('scripts/experiments/navigation-latency/server.mjs'),
			folder,
			'4496',
			'production',
			'--build-dir',
			buildDir,
		],
		{ cwd: resolve('website'), stdio: ['ignore', 'pipe', 'pipe'] },
	);
	let log = '';
	child.stdout.on('data', (data) => (log += data));
	child.stderr.on('data', (data) => (log += data));
	const stop = async () => {
		if (child.exitCode === null) child.kill('SIGTERM');
		const end = Date.now() + 5000;
		while (child.exitCode === null && Date.now() < end) await delay(25);
		await writeFile(resolve(folder, 'launcher.log'), log);
		assert.notEqual(child.exitCode, null, 'owned launcher must exit');
	};
	try {
		const end = Date.now() + 15000;
		while (!log.includes('NAVIGATION_SERVER_READY')) {
			if (child.exitCode !== null || Date.now() > end)
				throw Error('Launcher readiness failed: ' + log);
			await delay(25);
		}
		return { folder, stop };
	} catch (error) {
		await stop();
		throw error;
	}
}

test('before → after → before launches serve their selected build and working SSR navigation', async () => {
	const inventories = [await readBuildInventory(before), await readBuildInventory(after)];
	const differing = [...inventories[0].assets.keys()].find(
		(path) =>
			inventories[1].assets.has(path) &&
			inventories[0].assets.get(path).sha256 !== inventories[1].assets.get(path).sha256,
	);
	assert.ok(differing, 'fixtures must contain a distinguishing shared asset');
	const pointer = await readFile(resolve('website/node_modules/.nitro/last-build.json'));
	const browser = await chromium.launch({ headless: true });
	try {
		for (const [index, buildDir] of [before, after, before].entries()) {
			const server = await start(buildDir, 'launch-' + index);
			try {
				const inventory = inventories[index === 1 ? 1 : 0];
				const identity = await verifyServedAsset(
					'http://127.0.0.1:4496',
					inventory.assets.get(differing),
				);
				await writeFile(
					resolve(server.folder, 'identity.json'),
					JSON.stringify(identity, null, 2),
				);
				await assert.rejects(
					verifyServedAsset(
						'http://127.0.0.1:4496',
						inventories[index === 1 ? 0 : 1].assets.get(differing),
					),
					/identity mismatch/,
				);

				const context = await browser.newContext({ serviceWorkers: 'block' });
				try {
					const page = await context.newPage();
					const capture = captureApplicationJavaScript(page, inventory);
					let documents = 0;
					page.on('request', (request) => {
						if (request.isNavigationRequest() && request.frame() === page.mainFrame())
							documents++;
					});
					await page.addInitScript(() => {
						globalThis.documentNonce = crypto.randomUUID();
						globalThis.overflow = 0;
						performance.setResourceTimingBufferSize(20000);
						performance.addEventListener(
							'resourcetimingbufferfull',
							() => globalThis.overflow++,
						);
					});
					await page.goto('http://127.0.0.1:4496/markless/ui/select', {
						waitUntil: 'networkidle',
					});
					await expect(page.locator('h1')).toHaveText('select');
					const nonce = await page.evaluate(() => documentNonce);
					assert.ok(await page.locator('link[rel="modulepreload"]').count());
					await page
						.locator(`a[${LINK_ATTRIBUTE}][href="/markless/ui/accordion"]`)
						.first()
						.evaluate((element) => element.click());
					await expect(page.locator('h1')).toHaveText('Accordion');
					const trigger = page.locator('.practice-trigger').first();
					const expanded = await trigger.getAttribute('aria-expanded');
					await trigger.evaluate((element) => element.click());
					await expect(trigger).toHaveAttribute(
						'aria-expanded',
						expanded === 'true' ? 'false' : 'true',
					);
					assert.equal(await page.evaluate(() => documentNonce), nonce);
					assert.equal(documents, 1);
					const validation = await capture.finish(() =>
						page.evaluate(() => ({
							resources: performance
								.getEntriesByType('resource')
								.map((r) => r.toJSON()),
							overflow,
						})),
					);
					await writeFile(
						resolve(server.folder, 'javascript.json'),
						JSON.stringify(validation),
					);
					assert.deepEqual(validation.issues, []);
					await writeFile(
						resolve(server.folder, 'browser.json'),
						JSON.stringify({
							sameDocument: true,
							ssr: true,
							nativePreloads: true,
							interaction: true,
							clickMechanism: 'HTMLElement.click() through locator.evaluate',
						}),
					);
				} finally {
					await context.close();
				}
			} finally {
				await server.stop();
				await assertPortAvailable(4496);
			}
		}
	} finally {
		await browser.close();
	}
	assert.deepEqual(
		await readFile(resolve('website/node_modules/.nitro/last-build.json')),
		pointer,
	);
	for (const inventory of inventories)
		assert.equal((await readBuildInventory(inventory.buildDir)).digest, inventory.digest);
});

test('missing identity/body, unexpected JS and overflow invalidate samples', async () => {
	await assert.rejects(verifyServedAsset('http://127.0.0.1:4496', undefined), /Missing expected/);
	const valid = {
		url: 'http://127.0.0.1:4496/markless/build/fixture.js',
		expected: 'hash',
		sha256: 'hash',
		status: 200,
	};
	assert.equal(validateCapture({ responses: [valid] }).valid, true);
	for (const input of [
		{ responses: [{ ...valid, expected: undefined }] },
		{ responses: [{ ...valid, sha256: undefined }] },
		{ responses: [{ ...valid, sha256: 'different' }] },
		{ responses: [valid], overflow: 1 },
		{ responses: [valid], pending: 1 },
		{ responses: [valid], failures: ['Failed JavaScript load'] },
		{ responses: [valid], missingResources: [valid.url] },
	])
		assert.equal(validateCapture(input).valid, false);
});

test('occupied ports are refused without terminating their owner', async () => {
	const owner = net.createServer();
	await new Promise((resolve) => owner.listen(0, '127.0.0.1', resolve));
	try {
		await assert.rejects(assertPortAvailable(owner.address().port), /port unavailable/);
		assert.equal(owner.listening, true);
	} finally {
		await new Promise((resolve) => owner.close(resolve));
	}
});

test('readiness failure is bounded and cleans up the owned generated child', async () => {
	const folder = resolve(run, 'readiness-failure');
	const started = Date.now();
	await assert.rejects(
		launchProductionPreview({
			buildDir: before,
			output: folder,
			port: 4496,
			cwd: resolve('website'),
			timeoutMs: 0,
		}),
		/Bounded preview readiness/,
	);
	assert.ok(Date.now() - started < 6000);
	const cleanup = JSON.parse(await readFile(resolve(folder, 'cleanup.json')));
	assert.ok(cleanup.exitCode !== null || cleanup.signalCode !== null);
	assert.throws(() => process.kill(cleanup.childPid, 0));
	await assertPortAvailable(4496);
});

test('dev launch still uses canonical Vite Plus dev with its existing flags', () => {
	assert.deepEqual(devLaunchArgs('/tmp/config.ts', 4496), [
		'exec',
		'vp',
		'dev',
		'--config',
		'/tmp/config.ts',
		'--host',
		'127.0.0.1',
		'--port',
		'4496',
		'--strictPort',
	]);
});

test('termination during pending production readiness reaps only the owned child', async () => {
	const folder = resolve(run, 'cancel-pending');
	await mkdir(folder);
	const wrapper = spawn(
		process.execPath,
		[
			resolve('scripts/experiments/navigation-latency/server.mjs'),
			folder,
			'4496',
			'production',
			'--build-dir',
			before,
		],
		{ cwd: resolve('website'), stdio: ['ignore', 'pipe', 'pipe'] },
	);
	let log = '',
		receipt;
	wrapper.stdout.on('data', (data) => (log += data));
	wrapper.stderr.on('data', (data) => (log += data));
	try {
		const deadline = Date.now() + 10000;
		while (!receipt && Date.now() < deadline && wrapper.exitCode === null) {
			try {
				receipt = JSON.parse(await readFile(resolve(folder, 'server.json')));
			} catch {}
			if (!receipt) await delay(5);
		}
		assert.ok(receipt?.childPid);
		assert.equal(
			log.includes('NAVIGATION_SERVER_READY'),
			false,
			'cancellation must precede readiness',
		);
		wrapper.kill('SIGTERM');
		await new Promise((resolve) => wrapper.once('exit', resolve));
		assert.throws(() => process.kill(receipt.childPid, 0));
		await assertPortAvailable(4496);
		await writeFile(
			resolve(folder, 'cancellation.json'),
			JSON.stringify({ childPid: receipt.childPid, beforeReady: true, reaped: true }),
		);
	} finally {
		if (wrapper.exitCode === null && wrapper.signalCode === null) wrapper.kill('SIGTERM');
		await writeFile(resolve(folder, 'launcher.log'), log);
	}
});

test('reuse refuses receipt output inside its read-only build', async () => {
	for (const output of [before, resolve(before, 'new-launch')]) {
		await assert.rejects(
			launchProductionPreview({
				buildDir: before,
				output,
				port: 4496,
				cwd: resolve('website'),
			}),
			/read-only build/,
		);
	}
});

test('prefetched JavaScript reported as Other is captured and identity checked', async () => {
	const { EventEmitter } = await import('node:events');
	const { sha256 } = await import('./production-preview.mjs');
	const page = new EventEmitter();
	const url = 'http://127.0.0.1:4496/markless/build/prefetched.js';
	const body = Buffer.from('export const ready = true;');
	const inventory = { assets: new Map([[new URL(url).pathname, { sha256: sha256(body) }]]) };
	const capture = captureApplicationJavaScript(page, inventory);
	const request = {
		url: () => url,
		resourceType: () => 'other',
		sizes: async () => ({ responseBodySize: body.length }),
	};
	page.emit('request', request);
	page.emit('response', {
		url: () => url,
		request: () => request,
		status: () => 200,
		headers: () => ({ 'content-type': 'application/octet-stream' }),
		body: async () => body,
	});
	page.emit('requestfinished', request);
	const result = await capture.finish(async () => ({ resources: [{ name: url }], overflow: 0 }));
	assert.equal(result.valid, true);
	assert.equal(result.responses.length, 1);
	assert.equal(result.responses[0].requestType, 'other');
	assert.equal(result.responses[0].sha256, sha256(body));
});
