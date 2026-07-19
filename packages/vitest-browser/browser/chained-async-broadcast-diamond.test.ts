import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import BroadcastDiamond from './fixtures/chained-async-broadcast-diamond.tsrx';

afterEach(() => cleanup());

test('two boundaries share one async upstream run and revalidate it once per root write', async () => {
	(globalThis as any).__broadcastDiamondRuns = { source: 0, bulletin: 0, caption: 0 };
	const screen = await render(BroadcastDiamond);
	const container = screen.container as HTMLElement;
	const samples: string[] = [];
	const observer = observeRecords(container, samples);

	await expect
		.poll(() => container.querySelector('[data-bulletin-arm]')?.textContent)
		.toBe('Bulletin band-91-news');
	await expect
		.poll(() => container.querySelector('[data-caption-arm]')?.textContent)
		.toBe('Caption band-91-text');
	expect((globalThis as any).__broadcastDiamondRuns).toEqual({
		source: 1,
		bulletin: 1,
		caption: 1,
	});

	const change = container.querySelector<HTMLButtonElement>('button[data-retune-frequency]');
	if (!change) throw new Error('Expected the frequency control.');
	change.click();
	await expect
		.poll(() => container.querySelector('[data-bulletin-arm]')?.textContent)
		.toBe('Bulletin band-93-news');
	await expect
		.poll(() => container.querySelector('[data-caption-arm]')?.textContent)
		.toBe('Caption band-93-text');
	observer.disconnect();

	expect((globalThis as any).__broadcastDiamondRuns).toEqual({
		source: 2,
		bulletin: 2,
		caption: 2,
	});
	expect(samples).not.toContain('Bulletin dropped');
	expect(samples).not.toContain('Caption dropped');
});

function observeRecords(container: HTMLElement, samples: string[]): MutationObserver {
	const observer = new MutationObserver((records) => {
		for (const record of records) {
			if (record.type === 'characterData' && record.target.textContent !== null) {
				samples.push(record.target.textContent);
			}
			for (const node of record.addedNodes) {
				if (node.textContent) samples.push(node.textContent);
			}
		}
	});
	observer.observe(container, { characterData: true, childList: true, subtree: true });
	return observer;
}
