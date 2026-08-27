import { expect, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import Page from './page.tsrx';
import { quietWatches, watchRegion, type RegionWatch } from './mutations.ts';

// A polite live region announces on a DOM record, not on a difference, so a
// gesture that changes nothing inside one must leave it with no records at all.
// The first gesture is the one that matters: it wakes the demand-loaded runtime,
// which replays every binding on the page - branch arms included.

const el = (testId: string) => document.querySelector(`[data-testid="${testId}"]`) as HTMLElement;

type Regions = {
	readonly branch: RegionWatch;
	readonly flip: RegionWatch;
	readonly slot: RegionWatch;
	readonly all: ReadonlyArray<RegionWatch>;
	readonly reset: () => void;
	readonly stop: () => void;
};

const SILENT = { childList: 0, characterData: 0 };

async function mounted(mode: 'csr' | 'ssr'): Promise<Regions> {
	if (mode === 'csr') await render(Page);
	else await renderSSR(Page);
	await expect.poll(() => el('live-branch')?.textContent).toBe('August 2026');
	const watches = ['live-branch', 'live-flip', 'live-slot'].map((id) => watchRegion(el(id)));
	const [branch, flip, slot] = watches as [RegionWatch, RegionWatch, RegionWatch];
	return {
		branch,
		flip,
		slot,
		all: watches,
		reset: () => watches.forEach((watch) => watch.reset()),
		stop: () => watches.forEach((watch) => watch.stop()),
	};
}

async function click(testId: string, regions: Regions): Promise<void> {
	el(testId).click();
	await quietWatches(regions.all);
}

for (const mode of ['csr', 'ssr'] as const) {
	const lane = mode.toUpperCase();

	test(`${lane}: the first gesture leaves an unchanged branch region silent`, async () => {
		const regions = await mounted(mode);
		try {
			await click('idle', regions);
			expect(el('aside').textContent).toBe('1');
			expect(regions.branch.counts()).toEqual(SILENT);
			expect(regions.flip.counts()).toEqual(SILENT);
			expect(regions.slot.counts()).toEqual(SILENT);
		} finally {
			regions.stop();
		}
	});

	test(`${lane}: only the region whose value moved records anything`, async () => {
		const regions = await mounted(mode);
		try {
			await click('idle', regions);
			regions.reset();

			await click('tap', regions);
			expect(el('live-slot').textContent).toBe('Taps: 1');
			expect(regions.slot.total()).toBeGreaterThan(0);
			expect(regions.branch.counts()).toEqual(SILENT);
			expect(regions.flip.counts()).toEqual(SILENT);
			regions.reset();

			// The month moves, so both regions rendering the title are rewritten -
			// and the tally, which nothing about the month touches, is not.
			await click('retitle', regions);
			expect(el('live-branch').textContent).toBe('September 2026');
			expect(el('live-flip').textContent).toBe('September 2026');
			expect(regions.branch.counts().childList).toBeGreaterThan(0);
			expect(regions.flip.counts().childList).toBeGreaterThan(0);
			expect(regions.slot.counts()).toEqual(SILENT);
		} finally {
			regions.stop();
		}
	});

	test(`${lane}: a genuine arm flip rewrites its region and no other`, async () => {
		const regions = await mounted(mode);
		try {
			await click('idle', regions);
			regions.reset();

			await click('flip', regions);
			expect(el('live-flip').textContent).toBe('Custom heading');
			expect(regions.flip.counts().childList).toBeGreaterThan(0);
			expect(regions.branch.counts()).toEqual(SILENT);
			expect(regions.slot.counts()).toEqual(SILENT);
		} finally {
			regions.stop();
		}
	});
}
