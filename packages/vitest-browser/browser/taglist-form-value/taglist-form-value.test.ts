import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import NamedRowPage from './named-row-page.tsrx';
import SeededPage from './seeded-page.tsrx';

/**
 * `@markless/ui`'s taglist with taglist taken out: a widget-scope `shared()`
 * factory, a root writing the collection from its own prop, one part repeating
 * over it, one sibling part writing it.
 *
 * One row stays pinned: it calls a method on the collection, which mints no
 * computed, so nothing is wired to refresh it.
 */
afterEach(() => cleanup());

const el = (testid: string) => page.getByTestId(testid).element() as HTMLElement;
const fieldValues = () => [...el('field').querySelectorAll('input')].map((one) => one.value);
const namedFieldInputs = () => [...el('named-field').querySelectorAll('input')];
const namedFieldValues = () => namedFieldInputs().map((one) => one.value);
const namedFieldNames = () => namedFieldInputs().map((one) => one.name);
const count = () => el('field').getAttribute('ui-count');
const seen = () => el('field').getAttribute('ui-seen');
const click = (testid: string) => (el(testid) as HTMLButtonElement).click();

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: a sibling part's write drops a rendered key from the repeat`, async () => {
		if (mode === 'CSR') await render(SeededPage);
		else await renderSSR(SeededPage);

		expect(fieldValues()).toEqual(['alpha', 'beta']);
		click('drop');
		await expect.poll(() => count()).toBe('1');
		await expect.poll(() => fieldValues()).toEqual(['beta']);
	});

	test(`${mode}: a sibling part's write reaches every other binding on the repeat's host`, async () => {
		if (mode === 'CSR') await render(SeededPage);
		else await renderSSR(SeededPage);

		click('add');
		await expect.poll(() => seen()).toBe('gamma added');
		await expect.poll(() => count()).toBe('3');
	});

	test(`${mode}: the repeat mints a row for a key the first render never carried`, async () => {
		if (mode === 'CSR') await render(SeededPage);
		else await renderSSR(SeededPage);

		click('add');
		await expect.poll(() => count()).toBe('3');
		await expect.poll(() => fieldValues()).toEqual(['alpha', 'beta', 'gamma']);
	});

	// A plain cell and a property of the collection both refresh in a text child,
	// so the pinned row below is not about the text position.
	test(`${mode}: a text child over a cell and over a property of the collection refreshes`, async () => {
		if (mode === 'CSR') await render(SeededPage);
		else await renderSSR(SeededPage);

		expect(el('len').textContent).toBe('2');
		click('add');
		await expect.poll(() => el('plain').textContent).toBe('gamma added');
		await expect.poll(() => el('len').textContent).toBe('3');
	});

	// Pinned: an expression that CALLS a method on the collection is wired to
	// nothing, in a text child and in an attribute alike, so neither ever
	// refreshes while every other read on the same element does.
	test.fails(`${mode}: an expression calling a method on the collection refreshes`, async () => {
		if (mode === 'CSR') await render(SeededPage);
		else await renderSSR(SeededPage);

		expect(el('joined').textContent).toBe('alpha|beta');
		click('add');
		await expect.poll(() => count()).toBe('3');
		await expect.poll(() => el('joined').getAttribute('ui-joined')).toBe('alpha|beta|gamma');
		await expect.poll(() => el('joined').textContent).toBe('alpha|beta|gamma');
	});

	// The row template names the graph node the attribute reads, and composition
	// qualifies that node id the way it qualifies the repeat's collection id, so
	// the minted row's name lands on the instance's own cell.
	test(`${mode}: a row whose attribute reads a cell outside the item still mints`, async () => {
		if (mode === 'CSR') await render(NamedRowPage);
		else await renderSSR(NamedRowPage);

		expect(namedFieldValues()).toEqual(['alpha', 'beta']);
		click('add');
		await expect.poll(() => el('named-field').getAttribute('ui-count')).toBe('3');
		await expect.poll(() => namedFieldValues()).toEqual(['alpha', 'beta', 'gamma']);
		expect(namedFieldNames()).toEqual(['topics', 'topics', 'topics']);
	});
}
