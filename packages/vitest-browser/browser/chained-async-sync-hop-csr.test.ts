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
