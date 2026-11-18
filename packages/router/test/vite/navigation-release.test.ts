import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { buildFixture } from '../support/fixture-build.ts';

// In-place navigations between pages of one route, on a production build served by its own Nitro server in Chromium.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-navigation-release-'));
	await cp(resolve(import.meta.dirname, '../fixtures/navigation-release-app'), root, {
		recursive: true,
	});
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
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

async function open(path: string): Promise<{ page: Page; errors: string[] }> {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${server!.origin}${path}`);
	await page.waitForLoadState('load');
	return { page, errors };
}

test('in-place navigations leave no window or document listeners behind and retain no page beyond the visit cache', async () => {
	const { page, errors } = await open('/visit');
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('HeapProfiler.enable');
	const globalListeners = async () => {
		const types: string[] = [];
		for (const expression of ['window', 'document']) {
			const { result } = await cdp.send('Runtime.evaluate', { expression, objectGroup: 'leak' });
			const { listeners } = await cdp.send('DOMDebugger.getEventListeners', {
				objectId: result.objectId!,
			});
			types.push(...listeners.map((listener) => `${expression} ${listener.type}`));
		}
		await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'leak' });
		return types.sort();
	};
	// Every DOM node and document the renderer still holds, live or detached, with or without a JavaScript wrapper.
	const retainedNodes = async () => {
		await cdp.send('HeapProfiler.collectGarbage');
		await cdp.send('HeapProfiler.collectGarbage');
		const { nodes, documents } = await cdp.send('Memory.getDOMCounters');
		// Reachable objects only: the heap's used size also counts space V8 has not reclaimed, which swung 47 to 192 kB on one tree.
		const chunks: string[] = [];
		const collect = ({ chunk }: { chunk: string }) => chunks.push(chunk);
		cdp.on('HeapProfiler.addHeapSnapshotChunk', collect);
		await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
		cdp.off('HeapProfiler.addHeapSnapshotChunk', collect);
		const { snapshot, nodes: heapNodes } = JSON.parse(chunks.join('')) as {
			snapshot: { meta: { node_fields: string[] } };
			nodes: number[];
		};
		const fields = snapshot.meta.node_fields;
		const selfSize = fields.indexOf('self_size');
		let bytes = 0;
		for (let index = selfSize; index < heapNodes.length; index += fields.length)
			bytes += heapNodes[index]!;
		return { nodes, documents, heapKB: bytes / 1024 };
	};
	let n = 0;
	const navigate = async (times: number) => {
		for (const end = n + times; n < end; ) {
			await page.click('.next');
			await page.waitForURL(new RegExp(`n=${++n}$`));
			await page.click('.count');
			await expect.poll(() => page.locator('.count').textContent()).toBe('1');
		}
		// The page fetched ahead for the next visit is part of what each measurement holds.
		await page.hover('.next');
		await page.waitForFunction(
			() =>
				(document as unknown as { __marklessFragmentNav?: { prefetches: Map<string, unknown> } })
					.__marklessFragmentNav?.prefetches.size === 1,
		);
		await page.evaluate(async () => {
			const nav = (
				document as unknown as {
					__marklessFragmentNav: { prefetches: Map<string, { result: Promise<unknown> }> };
				}
			).__marklessFragmentNav;
			for (const entry of nav.prefetches.values()) await entry.result.catch(() => {});
		});
	};
	await page.click('.count');
	await navigate(1);
	const listeners = await globalListeners();
	// Past the router's eight-page visit cache, so later visits only replace what it holds.
	await navigate(11);
	const settled = await retainedNodes();
	await navigate(10);
	const listenersAfter = await globalListeners();
	const after = await retainedNodes();
	expect(listenersAfter).toEqual(listeners);
	expect(after.documents).toBeLessThanOrEqual(settled.documents);
	// A held page adds about 630 nodes; without one the count does not move.
	expect(after.nodes).toBeLessThanOrEqual(settled.nodes + 16);
	// Reachable growth over these ten visits without a leak: 39 to 88 kB in 12 runs at 6x CPU throttle.
	expect(after.heapKB - settled.heapKB).toBeLessThan(300);
	expect(errors).toEqual([]);
	await page.close();
});
