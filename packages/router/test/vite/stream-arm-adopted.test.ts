import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { buildFixture } from '../support/fixture-build.ts';

// A streamed @try arm the woken runtime adopts before the stream commits it, on a production build in Chromium.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-stream-arm-adopted-'));
	await cp(resolve(import.meta.dirname, '../fixtures/stream-arm-adopted-app'), root, {
		recursive: true,
	});
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(
		resolve(packagesRoot, 'router/node_modules/nitro'),
		join(root, 'node_modules/nitro'),
		'dir',
	);
	await buildFixture({
		root,
	});
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	browser = await launchBrowser(chromium);
});

afterAll(async () => {
	await browser?.close();
	await server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

// A proxy that holds the response back at the stream executor's `__mArm(` call until released, as a CDN chunk boundary can.
async function splitAtArmCommit(upstream: string) {
	let release = () => {};
	const released = new Promise<void>((done) => (release = done));
	const proxy: Server = createServer(async (request, response) => {
		const answer = await fetch(`${upstream}${request.url}`, {
			headers: { accept: 'text/html' },
		});
		response.writeHead(answer.status, {
			'content-type': answer.headers.get('content-type') ?? 'text/html',
		});
		const decoder = new TextDecoder();
		let held = '';
		let split = false;
		for await (const chunk of answer.body as unknown as AsyncIterable<Uint8Array>) {
			if (split) {
				response.write(chunk);
				continue;
			}
			held += decoder.decode(chunk, { stream: true });
			const at = held.search(/<script[^>]*>__mArm\(/);
			if (at < 0) continue;
			response.write(held.slice(0, at));
			await released;
			response.write(held.slice(at));
			split = true;
		}
		if (!split) response.write(held);
		response.end();
	});
	await new Promise<void>((done) => proxy.listen(0, '127.0.0.1', done));
	const { port } = proxy.address() as AddressInfo;
	return {
		origin: `http://127.0.0.1:${port}`,
		release,
		close: () => new Promise<void>((done) => proxy.close(() => done())),
	};
}

test('a streamed arm the woken runtime adopted before the stream commits it shows once, with no error', async () => {
	const proxy = await splitAtArmCommit(server!.origin);
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	try {
		await page.goto(`${proxy.origin}/profile`, { waitUntil: 'commit' });
		// Everything of the arm but its commit has arrived; a runtime awake now may take it first.
		await page.locator('script[type="markless/state-patch"]').waitFor({ state: 'attached' });
		await page.click('.tap');
		await expect.poll(() => page.locator('.tap').textContent()).toBe('1');
		await expect.poll(() => page.locator('.profile').textContent()).toBe('value patio11');
		proxy.release();
		await page.waitForLoadState('load');
		// The stream's commit runs on its own timer; an error it throws surfaces one task later.
		await page.evaluate(
			() =>
				new Promise<void>((done) =>
					(
						globalThis as unknown as { __mArm: { idle: (run: () => void) => void } }
					).__mArm.idle(() => setTimeout(done)),
				),
		);
		await expect.poll(() => page.locator('.profile').getAttribute('data-attached')).toBe('yes');
		expect(await page.locator('.profile').count()).toBe(1);
		expect(
			await page.evaluate(() => (window as { browserRuns?: number }).browserRuns ?? 0),
		).toBe(0);
		expect(errors).toEqual([]);
	} finally {
		proxy.release();
		await page.close();
		await proxy.close();
	}
});

async function openSettled(path: string) {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${server!.origin}${path}`, { waitUntil: 'load' });
	await page.evaluate(
		() =>
			new Promise<void>((done) =>
				(
					globalThis as unknown as { __mArm: { idle: (run: () => void) => void } }
				).__mArm.idle(() => requestIdleCallback(() => done())),
			),
	);
	return { page, errors };
}

// Open defect: the idle queue is installed only for idle records in the page's own module, so a child's streamed arm never queues its host.
test.fails('an onIdle host inside a streamed arm runs once the runtime has started', async () => {
	const { page, errors } = await openSettled('/watched');
	try {
		expect(await page.locator('.watched .value').textContent()).toBe('value idle');
		await expect
			.poll(async () => Number(await page.locator('.arm-ticks').textContent()), {
				timeout: 3_000,
			})
			.toBeGreaterThan(1);
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

test('a shared() value read only inside a streamed arm repaints when written', async () => {
	const { page, errors } = await openSettled('/shared');
	try {
		expect(await page.locator('.theme').textContent()).toBe('Theme paper');
		await page.click('.flip');
		await expect.poll(() => page.locator('.theme').textContent()).toBe('Theme ink');
		await page.click('.flip');
		await expect.poll(() => page.locator('.theme').textContent()).toBe('Theme paper');
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

test('a plain form inside a streamed arm is busy while it is sent in place', async () => {
	const { page, errors } = await openSettled('/noted');
	try {
		await page.evaluate(() => {
			const seen: Array<string | null> = ((
				window as { busySeen?: Array<string | null> }
			).busySeen = []);
			const form = document.querySelector('.note-form')!;
			new MutationObserver(() => seen.push(form.getAttribute('aria-busy'))).observe(form, {
				attributeFilter: ['aria-busy'],
			});
		});
		const title = `typed ${Date.now()}`;
		await page.locator('.note-title').fill(title);
		await page.click('.note-submit');
		await expect
			.poll(async () => (await fetch(`${server!.origin}/api/notes`)).json())
			.toContain(title);
		const busySeen = () =>
			page.evaluate(() => (window as { busySeen?: Array<string | null> }).busySeen ?? []);
		await expect.poll(async () => (await busySeen()).at(-1), { timeout: 5_000 }).toBeNull();
		expect(await busySeen()).toContain('true');
		expect(page.url()).toBe(`${server!.origin}/noted`);
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

test('a child with its own slower async value inside a streamed arm settles', async () => {
	const { page, errors } = await openSettled('/nested');
	try {
		await expect.poll(() => page.locator('.outer .value').textContent()).toBe('value outer');
		await expect
			.poll(() => page.locator('.late').textContent(), { timeout: 5_000 })
			.toBe('late answer');
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});
