import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Composed from './composed-hosts.tsrx';
import NestedVisible from './nested-visible.tsrx';
import ThreeHosts from './three-hosts.tsrx';

const host = globalThis as { __idleCounts?: Record<string, number> };
const settle = (ms = 100) => new Promise((done) => setTimeout(done, ms));

afterEach(async () => {
	await cleanup();
	delete host.__idleCounts;
});

for (const mode of ['csr', 'ssr'] as const) {
	const csr = async (component: Parameters<typeof render>[0]) =>
		(await render(component)).container as unknown as HTMLElement;
	const mount = {
		three: async () =>
			mode === 'csr' ? csr(ThreeHosts) : (await renderSSR(ThreeHosts)).container,
		composed: async () =>
			mode === 'csr' ? csr(Composed) : (await renderSSR(Composed)).container,
	};

	test(`${mode}: each of three onIdle elements in one component runs once`, async () => {
		await mount.three();
		await expect.poll(() => Object.keys(host.__idleCounts ?? {}).length).toBe(3);
		await settle(300);
		expect(host.__idleCounts).toEqual({ panel: 1, grid: 1, details: 1 });
	});

	test(`${mode}: a root onIdle beside two child components' onIdle runs once`, async () => {
		const container = await mount.composed();
		await expect.poll(() => Object.keys(host.__idleCounts ?? {}).length).toBe(3);
		await settle(300);
		expect(host.__idleCounts).toEqual({ panel: 1, grid: 1, details: 1 });
		expect(container.querySelector('output')?.textContent).toBe('5000');
	});
}

test('ssr: nested onVisible elements each run once', async () => {
	await renderSSR(NestedVisible);
	await expect.poll(() => Object.keys(host.__idleCounts ?? {}).length).toBe(3);
	await settle(300);
	expect(host.__idleCounts).toEqual({ outer: 1, inner: 1, aside: 1 });
});
