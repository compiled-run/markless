import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { aborted, loads, resetLoads, settleAll, waitingFor } from './api.ts';
import NestedRowsPage from './nested-rows-page.tsrx';
import OwnedRowsPage from './owned-rows-page.tsrx';
import PlainRowsPage from './plain-rows-page.tsrx';

// A component in a @for row runs only while its row stands: a removed row's values stop, and a returning key starts fresh.
beforeEach(resetLoads);
afterEach(cleanup);

const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
const panel = (tag: string) => {
	const section = document.querySelector(`[data-panel="${tag}"]`);
	return section
		? (section.querySelector('[data-name]') ??
				section.querySelector('[data-loading]'))!.textContent!.trim()
		: null;
};
const pages = {
	plain: { CSR: () => render(PlainRowsPage), SSR: () => renderSSR(PlainRowsPage) },
	owned: { CSR: () => render(OwnedRowsPage), SSR: () => renderSSR(OwnedRowsPage) },
	nested: { CSR: () => render(NestedRowsPage), SSR: () => renderSSR(NestedRowsPage) },
};

async function settle(tag: string, id: number) {
	await expect.poll(() => waitingFor(tag, id)).toBeGreaterThan(0);
	settleAll(tag, id);
}
async function served(mode: 'CSR' | 'SSR', tags: ReadonlyArray<string>) {
	if (mode === 'CSR') for (const tag of tags) await settle(tag, 0);
	await expect.poll(() => tags.map(panel)).toEqual(tags.map((tag) => `${tag} 0`));
}
// A later pass would have started any load the step let through.
async function passes() {
	for (let at = 0; at < 3; at++) await new Promise((resolve) => setTimeout(resolve, 0));
}
const asked = (round: number) => loads.filter((load) => load.endsWith(`:${round}`));

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: a removed row's load in flight is aborted, and the key coming back loads once afresh`, async () => {
		await pages.plain[mode]();
		await served(mode, ['row1', 'row2']);
		click('[data-next]');
		await expect.poll(() => waitingFor('row2', 1)).toBe(1);
		click('[data-drop]');
		await expect.poll(() => panel('row2')).toBeNull();
		expect(aborted.filter((load) => load.endsWith(':1'))).toEqual(['row2:1']);
		await settle('row1', 1);
		click('[data-back]');
		await expect.poll(() => panel('row2')).toBe('Loading');
		await settle('row2', 1);
		await expect.poll(() => panel('row2')).toBe('row2 1');
		await passes();
		expect(asked(1)).toEqual(['row1:1', 'row2:1', 'row2:1']);
	});

	test(`${mode}: a row removed in one of two instances of the same component stops only there`, async () => {
		await pages.owned[mode]();
		await served(mode, ['x1', 'x2', 'y1', 'y2']);
		click('[data-owner="x"] [data-drop]');
		await expect.poll(() => panel('x2')).toBeNull();
		click('[data-next]');
		for (const tag of ['x1', 'y1', 'y2']) await settle(tag, 1);
		await expect.poll(() => ['x1', 'y1', 'y2'].map(panel)).toEqual(['x1 1', 'y1 1', 'y2 1']);
		await passes();
		expect(asked(1).sort()).toEqual(['x1:1', 'y1:1', 'y2:1']);
	});

	test(`${mode}: a removed inner row, and an outer row with everything in it, stop`, async () => {
		await pages.nested[mode]();
		await served(mode, ['a1', 'a2', 'b1']);
		click('[data-drop-inner]');
		await expect.poll(() => panel('a2')).toBeNull();
		click('[data-next]');
		await settle('a1', 1);
		await settle('b1', 1);
		await passes();
		expect(asked(1).sort()).toEqual(['a1:1', 'b1:1']);
		click('[data-drop-outer]');
		await expect.poll(() => panel('b1')).toBeNull();
		click('[data-next]');
		await settle('a1', 2);
		await expect.poll(() => panel('a1')).toBe('a1 2');
		await passes();
		expect(asked(2)).toEqual(['a1:2']);
	});
}
