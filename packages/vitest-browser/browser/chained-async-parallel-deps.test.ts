import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import AviaryFault from './fixtures/chained-async-aviary-fault.tsrx';
import QuarryConfluence from './fixtures/chained-async-quarry-confluence.tsrx';

afterEach(() => cleanup());

test('two async dependencies start in parallel and gate one downstream run through revalidation', async () => {
	(globalThis as any).__quarryConfluenceRuns = {
		shale: 0,
		crystal: 0,
		mosaic: 0,
		firstSettleSawBothStarted: false,
	};
	const screen = await render(QuarryConfluence);
	const container = screen.container as HTMLElement;
	const commits: string[] = [];
	const observer = observeCommits(container, commits);

	await expect
		.poll(() => container.querySelector('[data-mosaic-arm]')?.textContent)
		.toBe('Mosaic amber-rough / amber-clear');

	const firstRuns = (globalThis as any).__quarryConfluenceRuns;
	expect(firstRuns).toMatchObject({
		shale: 1,
		crystal: 1,
		mosaic: 1,
		firstSettleSawBothStarted: true,
	});
	expect(commits).not.toContain('Shale fracture');
	expect(commits).not.toContain('Crystal fracture');
	expect(commits).not.toContain('Mosaic fracture');

	const shift = container.querySelector<HTMLButtonElement>('button[data-shift-stratum]');
	if (!shift) throw new Error('Expected the stratum control.');
	shift.click();
	await expect
		.poll(() => container.querySelector('[data-mosaic-arm]')?.textContent)
		.toBe('Mosaic violet-rough / violet-clear');
	observer.disconnect();

	expect((globalThis as any).__quarryConfluenceRuns).toMatchObject({
		shale: 2,
		crystal: 2,
		mosaic: 2,
	});
	expect(commits).not.toContain('Shale fracture');
	expect(commits).not.toContain('Crystal fracture');
	expect(commits).not.toContain('Mosaic fracture');
});

test('an upstream rejection reaches the downstream catch arm without running downstream', async () => {
	(globalThis as any).__aviaryFaultRuns = { rook: 0, tern: 0, atlas: 0 };
	const screen = await render(AviaryFault);
	const container = screen.container as HTMLElement;

	await expect
		.poll(() => container.querySelector('[data-atlas-arm]')?.textContent)
		.toBe('Atlas grounded');

	expect(container.querySelector('[data-tern-arm]')?.textContent).toBe('Tern lost');
	expect((globalThis as any).__aviaryFaultRuns).toEqual({ rook: 1, tern: 1, atlas: 0 });
});

function observeCommits(container: HTMLElement, commits: string[]): MutationObserver {
	const observer = new MutationObserver((records) => {
		for (const record of records) {
			if (record.type === 'characterData' && record.target.textContent) {
				commits.push(record.target.textContent);
			}
			for (const node of record.addedNodes) {
				if (node.textContent) commits.push(node.textContent);
			}
		}
	});
	observer.observe(container, { characterData: true, childList: true, subtree: true });
	return observer;
}
