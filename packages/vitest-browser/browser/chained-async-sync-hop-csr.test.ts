import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import SyncHopArchive from './fixtures/chained-async-sync-hop-csr.tsrx';

afterEach(() => cleanup());

test('cold CSR carries async demand through a sync computed hop and revalidates', async () => {
	(globalThis as any).__syncHopRuns = { sample: 0, label: 0 };
	const screen = await render(SyncHopArchive);
	const container = screen.container as HTMLElement;

	await expect
		.poll(() => container.querySelector('[data-exhibit]')?.textContent)
		.toBe('Exhibit azurite-fired');
	expect(container.querySelector('[data-failure]')).toBeNull();
	expect((globalThis as any).__syncHopRuns).toEqual({ sample: 1, label: 1 });

	const change = container.querySelector<HTMLButtonElement>('[data-change-mineral]');
	if (!change) throw new Error('Expected the mineral control.');
	change.click();
	await expect
		.poll(() => container.querySelector('[data-exhibit]')?.textContent)
		.toBe('Exhibit ochre-fired');
	expect(container.querySelector('[data-failure]')).toBeNull();
	expect((globalThis as any).__syncHopRuns).toEqual({ sample: 2, label: 2 });
});

test('cold CSR runs each async value once whichever symbol loads last', async () => {
	const base = SyncHopArchive as unknown as {
		readonly loadSymbol: (symbolId: string) => unknown;
	};
	const mount = async (late: (symbolId: string) => boolean) => {
		const asked: string[] = [];
		const runs = ((globalThis as any).__syncHopRuns = { sample: 0, label: 0 });
		const screen = await render({
			...base,
			loadSymbol: async (symbolId: string) => {
				asked.push(symbolId);
				if (late(symbolId)) await new Promise((resolve) => setTimeout(resolve, 150));
				return base.loadSymbol(symbolId);
			},
		} as typeof SyncHopArchive);
		const container = screen.container as HTMLElement;
		const exhibit = () => container.querySelector('[data-exhibit]')?.textContent;
		await expect.poll(exhibit).toBe('Exhibit azurite-fired');
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(runs).toEqual({ sample: 1, label: 1 });
		container.querySelector<HTMLButtonElement>('[data-change-mineral]')!.click();
		await expect.poll(exhibit).toBe('Exhibit ochre-fired');
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(runs).toEqual({ sample: 2, label: 2 });
		cleanup();
		return asked;
	};
	const symbols = [...new Set(await mount(() => false))];
	expect(symbols.length).toBeGreaterThan(1);
	for (const symbol of symbols) {
		await mount((symbolId) => symbolId === symbol);
		await mount((symbolId) => symbolId !== symbol);
	}
});
