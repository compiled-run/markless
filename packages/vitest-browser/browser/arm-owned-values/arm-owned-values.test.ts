import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { aborted, derives, loads, resetLoads, settleAll, waitingFor } from './api.ts';
import FlightOpenPage from './flight-open-page.tsrx';
import FlightPage from './flight-page.tsrx';
import NestedOpenPage from './nested-open-page.tsrx';
import NestedPage from './nested-page.tsrx';
import PlainRowsPage from './plain-rows-page.tsrx';
import RowsPage from './rows-page.tsrx';
import SwitchPage from './switch-page.tsrx';

// The values of a component an @if or @switch arm holds run only while that arm shows.
beforeEach(resetLoads);
afterEach(cleanup);

const text = (selector: string) =>
	document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
const panel = (tag: string) => {
	const section = document.querySelector(`[data-panel="${tag}"]`);
	return section ? (section.querySelector('[data-name]') ?? section.querySelector('[data-loading]'))!.textContent!.trim() : null;
};
type Mode = 'CSR' | 'SSR';
type Mount = () => Promise<unknown>;
// renderSSR takes its component literally, so each page spells both mounts.
const pages = {
	flight: { CSR: () => render(FlightPage), SSR: () => renderSSR(FlightPage) },
	flightOpen: { CSR: () => render(FlightOpenPage), SSR: () => renderSSR(FlightOpenPage) },
	nested: { CSR: () => render(NestedPage), SSR: () => renderSSR(NestedPage) },
	nestedOpen: { CSR: () => render(NestedOpenPage), SSR: () => renderSSR(NestedOpenPage) },
	switched: { CSR: () => render(SwitchPage), SSR: () => renderSSR(SwitchPage) },
	rows: { CSR: () => render(RowsPage), SSR: () => renderSSR(RowsPage) },
	plainRows: { CSR: () => render(PlainRowsPage), SSR: () => renderSSR(PlainRowsPage) },
} satisfies Record<string, Record<Mode, Mount>>;

async function settle(tag: string, id: number) {
	await expect.poll(() => waitingFor(tag, id)).toBeGreaterThan(0);
	settleAll(tag, id);
}

// A later pass would have started any load the step let through.
async function passes() {
	for (let at = 0; at < 3; at++) await new Promise((resolve) => setTimeout(resolve, 0));
}

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: a load in flight when its arm closes is aborted, its answer never shows, and a reopen loads afresh`, async () => {
		await pages.flight[mode]();
		click('[data-open]');
		await expect.poll(() => waitingFor('flight', 1)).toBe(1);
		click('[data-close]');
		await expect.poll(() => panel('flight')).toBeNull();
		expect(aborted).toEqual(['flight:1']);
		settleAll('flight', 1);
		await passes();
		expect(panel('flight')).toBeNull();
		click('[data-open]');
		await expect.poll(() => panel('flight')).toBe('Loading');
		await settle('flight', 1);
		await expect.poll(() => panel('flight')).toBe('flight 1');
		expect(loads).toEqual(['flight:1', 'flight:1']);
	});

	test(`${mode}: an arm open in the first render aborts its load when it closes and loads afresh when it reopens`, async () => {
		await pages.flightOpen[mode]();
		if (mode === 'CSR') await settle('flight', 1);
		await expect.poll(() => panel('flight')).toBe('flight 1');
		click('[data-next]');
		await expect.poll(() => waitingFor('flight', 2)).toBe(1);
		expect(aborted).not.toContain('flight:2');
		click('[data-close]');
		await expect.poll(() => panel('flight')).toBeNull();
		expect(aborted).toContain('flight:2');
		settleAll('flight', 2);
		click('[data-open]');
		await expect.poll(() => panel('flight')).toBe('Loading');
		await settle('flight', 1);
		await expect.poll(() => panel('flight')).toBe('flight 1');
		expect(loads).toEqual(mode === 'CSR' ? ['flight:1', 'flight:2', 'flight:1'] : ['flight:2', 'flight:1']);
	});

	test(`${mode}: a value the arm reads but its owner declares keeps running outside the closed arm`, async () => {
		await pages.flightOpen[mode]();
		if (mode === 'CSR') await settle('flight', 1);
		await expect.poll(() => text('[data-inside]')).toBe('0');
		click('[data-close]');
		await expect.poll(() => panel('flight')).toBeNull();
		click('[data-bump]');
		await expect.poll(() => text('[data-outside]')).toBe('2');
		expect(derives).toContain(2);
		click('[data-open]');
		await expect.poll(() => text('[data-inside]')).toBe('2');
	});

	for (const [shape, page] of [
		['opened later', pages.nested],
		['open in the first render', pages.nestedOpen],
	] as const)
		test(`${mode}: nested arms, inner ${shape}: the inner arm closing stops only its own component`, async () => {
			await page[mode]();
			if (shape === 'opened later') click('[data-inner-open]');
			if (mode === 'CSR') await settle('outer', 1);
			if (mode === 'CSR' || shape === 'opened later') await settle('inner', 1);
			await expect.poll(() => [panel('outer'), panel('inner')]).toEqual(['outer 1', 'inner 1']);
			click('[data-inner-close]');
			await expect.poll(() => panel('inner')).toBeNull();
			click('[data-next]');
			await settle('outer', 2);
			await expect.poll(() => panel('outer')).toBe('outer 2');
			click('[data-outer-close]');
			await expect.poll(() => panel('outer')).toBeNull();
			click('[data-next]');
			await passes();
			expect(loads.filter((load) => load.endsWith(':2') || load.endsWith(':3'))).toEqual(['outer:2']);
		});

	test(`${mode}: a @switch moving between two arms that hold the same component runs only the arm it moved to`, async () => {
		await pages.switched[mode]();
		if (mode === 'CSR') await settle('a', 1);
		await expect.poll(() => panel('a')).toBe('a 1');
		click('[data-to-b]');
		await expect.poll(() => panel('b')).toBe('Loading');
		await settle('b', 2);
		await expect.poll(() => panel('b')).toBe('b 2');
		click('[data-to-a]');
		await expect.poll(() => panel('a')).toBe('Loading');
		await settle('a', 3);
		await expect.poll(() => panel('a')).toBe('a 3');
		await passes();
		expect(loads.filter((load) => load !== 'a:1')).toEqual(['b:2', 'a:3']);
	});

	// Known defect, not the arm's: a removed row's component keeps running, with or without an arm around it (row teardown).
	for (const [shape, page] of [
		['in an arm', pages.rows],
		['with no arm', pages.plainRows],
	] as const)
		test.fails(`${mode}: a component ${shape} in a @for row that is removed runs nothing after the row goes`, async () => {
			await page[mode]();
			if (mode === 'CSR') {
				await settle('row1', 0);
				await settle('row2', 0);
			}
			await expect.poll(() => [panel('row1'), panel('row2')]).toEqual(['row1 0', 'row2 0']);
			click('[data-drop]');
			await expect.poll(() => panel('row2')).toBeNull();
			click('[data-next]');
			await settle('row1', 1);
			await expect.poll(() => panel('row1')).toBe('row1 1');
			await passes();
			expect(loads.filter((load) => load.endsWith(':1'))).toEqual(['row1:1']);
		});
}
