import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { asked, hold, release, reset } from '../matched-values/gates.ts';
import { ChainMarks } from './chain-marks.tsrx';
import { RangeChart } from './range-chart.tsrx';
import { KeyedByData } from './seeded-editor-by-data.tsrx';
import { KeyedByInput } from './seeded-editor.tsrx';
import { Sentences } from './sentences.tsrx';
import { busy, click, each, poll, text, watch } from './support.ts';

// Witnesses for Maïeul's inline-pending cases about which values wait and what they show during a refresh.
afterEach(() => {
	reset();
	cleanup();
});

// Gap: only the value the click changed is marked; the values downstream are never marked, not even during their own requests.
each('a chain of dependent values marks each value until its own answer lands', { csr: () => render(ChainMarks), ssr: () => renderSSR(ChainMarks) }, async (container) => {
	await expect.poll(() => text(container, '[data-eta]'), poll).toBe('north-depot-route-eta');
	hold('depot:south', 'route:south-depot', 'eta:south-depot-route');
	click(container, '[data-south]');
	await expect.poll(() => busy(container, '[data-depot]'), poll).toBe(true);
	expect(busy(container, '[data-route]'), 'the route waits on the depot from the click').toBe(true);
	expect(busy(container, '[data-eta]'), 'the eta waits on the depot from the click').toBe(true);

	release('depot:south');
	await expect.poll(() => text(container, '[data-depot]'), poll).toBe('south-depot');
	await expect.poll(() => busy(container, '[data-depot]'), poll).toBe(false);
	await expect.poll(() => asked.includes('route:south-depot'), poll).toBe(true);
	expect(busy(container, '[data-route]'), 'the route still waits on its own request').toBe(true);
	expect(busy(container, '[data-eta]')).toBe(true);
	expect(text(container, '[data-route]')).toBe('north-depot-route');

	release('route:south-depot');
	await expect.poll(() => text(container, '[data-route]'), poll).toBe('south-depot-route');
	await expect.poll(() => busy(container, '[data-route]'), poll).toBe(false);
	await expect.poll(() => asked.includes('eta:south-depot-route'), poll).toBe(true);
	expect(busy(container, '[data-eta]'), 'the eta still waits on its own request').toBe(true);

	release('eta:south-depot-route');
	await expect.poll(() => text(container, '[data-eta]'), poll).toBe('south-depot-route-eta');
	await expect.poll(() => container.querySelectorAll('[aria-busy="true"]').length, poll).toBe(0);
	expect(container.querySelector('[data-pending]')).toBeNull();
}, test.fails);

const editors = (container: HTMLElement) =>
	[...container.querySelectorAll<HTMLElement>('[data-editor]')].map(
		(editor) => `${editor.getAttribute('data-editor')}:${editor.querySelector('textarea')?.value ?? ''}`,
	);

async function pickNewSubject(container: HTMLElement) {
	await expect.poll(() => editors(container), poll).toEqual(['a:Body of a']);
	hold('doc:b');
	const stop = watch(container, { editors: () => editors(container).join('|') });
	click(container, '[data-pick-b]');
	await expect.poll(() => asked.includes('doc:b'), poll).toBe(true);
	release('doc:b');
	await expect.poll(() => editors(container).join('|'), poll).toMatch(/^b:/);
	const seen = stop().editors;
	expect(seen.filter((pair) => pair.includes('b:Body of a')), 'an editor for b was seeded with a').toEqual([]);
	expect(editors(container)).toEqual(['b:Body of b']);
}

// Gap: a row keyed by the picked id mounts at the click, before the new document lands, and seeds its draft from undefined.
each('a child keyed by the picked id starts from the new subject’s data', { csr: () => render(KeyedByInput), ssr: () => renderSSR(KeyedByInput) }, pickNewSubject, test.fails);

each('a child keyed by the fetched document starts from the new subject’s data', { csr: () => render(KeyedByData), ssr: () => renderSSR(KeyedByData) }, pickNewSubject);

each('an in-place switch changes what it shows once, and its transition starts once', { csr: () => render(RangeChart), ssr: () => renderSSR(RangeChart) }, async (container) => {
	await expect.poll(() => text(container, '[data-bars]'), poll).toBe('3 0 4 0 0 0 9');
	const chart = container.querySelector<HTMLElement>('[data-chart]')!;
	let runs = 0;
	let ends = 0;
	chart.addEventListener('transitionrun', () => runs++);
	chart.addEventListener('transitionend', () => ends++);
	// A transition needs a computed starting width, as a painted page has before anyone clicks.
	expect(getComputedStyle(chart).width).toBe('28px');
	hold('sales:30d');
	const stop = watch(container, { bars: () => text(container, '[data-bars]')?.split(' ').length ?? 0 });
	click(container, '[data-month]');
	await expect.poll(() => asked.includes('sales:30d'), poll).toBe(true);
	await expect.poll(() => busy(container, '[data-bars]') || busy(container, '[data-chart]'), poll).toBe(true);
	release('sales:30d');
	await expect.poll(() => chart.style.width, poll).toBe('120px');
	await expect.poll(() => ends, poll).toBe(1);
	expect(container.querySelector('[data-chart]'), 'the chart was replaced, not switched in place').toBe(chart);
	expect(stop().bars, 'bar counts shown, in order').toEqual([7, 30]);
	expect(runs, 'width transitions started').toBe(1);
});

const lines = (container: HTMLElement) => ({
	split: text(container, '[data-split]'),
	joined: text(container, '[data-joined]'),
});

each('split bindings and one expression show the same sentence through a refresh', { csr: () => render(Sentences), ssr: () => renderSSR(Sentences) }, async (container) => {
	await expect.poll(() => text(container, '[data-joined]'), poll).toBe('€1000 a day over 10d');
	hold('revenue:20');
	const stop = watch(container, { lines: () => lines(container) });
	click(container, '[data-twenty]');
	await expect.poll(() => asked.includes('revenue:20'), poll).toBe(true);
	click(container, '[data-dollar]');
	await expect.poll(() => text(container, '[data-joined]')?.startsWith('$'), poll).toBe(true);
	release('revenue:20');
	await expect.poll(() => text(container, '[data-joined]'), poll).toBe('$1100 a day over 20d');
	const seen = stop().lines;
	expect(seen.filter((pair) => pair.split !== pair.joined), 'moments the two spellings disagreed').toEqual([]);
});

each('wrapping a read in a helper call shows the same figure through a refresh', { csr: () => render(Sentences), ssr: () => renderSSR(Sentences) }, async (container) => {
	await expect.poll(() => text(container, '[data-bare]'), poll).toBe('1000 a day');
	const figures = () => ({ bare: text(container, '[data-bare]'), wrapped: text(container, '[data-wrapped]') });
	hold('revenue:20');
	const stop = watch(container, { figures });
	click(container, '[data-twenty]');
	await expect.poll(() => asked.includes('revenue:20'), poll).toBe(true);
	await expect.poll(() => busy(container, '[data-bare]') && busy(container, '[data-wrapped]'), poll).toBe(true);
	expect(figures()).toEqual({ bare: '1000 a day', wrapped: '1000 a day' });
	release('revenue:20');
	await expect.poll(() => text(container, '[data-wrapped]'), poll).toBe('1100 a day');
	const seen = stop().figures;
	expect(seen.filter((pair) => pair.bare !== pair.wrapped), 'moments the two spellings disagreed').toEqual([]);
	expect(seen.map((pair) => pair.wrapped)).toEqual(['1000 a day', '1100 a day']);
});
