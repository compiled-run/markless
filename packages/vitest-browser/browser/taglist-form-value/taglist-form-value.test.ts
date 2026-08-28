import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import SeededPage from './seeded-page.tsrx';

/**
 * Built while diagnosing `@markless/ui`'s taglist, whose `taglist.field` renders
 * one hidden input per tag and never carries a tag added after the first render,
 * while an attribute over the same cell on the same host element refreshes.
 *
 * This is that shape with taglist taken out: a widget-scope `shared()` factory, a
 * root writing the collection from its own prop, one part repeating over it, one
 * sibling part writing it. Every row is green — so the reduction does NOT
 * reproduce the failure, and that is the finding it records. The ingredient is
 * something taglist still adds; the candidates and the two compiler diagnostics
 * that blocked reducing further are in
 * goals/headless-components/notes/U697-taglist-defects.md.
 *
 * Keep these rows: they are the floor a fix for the taglist repeat must not
 * break, and they say precisely which half of the behaviour already works.
 */
afterEach(() => cleanup());

const el = (testid: string) => page.getByTestId(testid).element() as HTMLElement;
const fieldValues = () => [...el('field').querySelectorAll('input')].map((one) => one.value);
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
}
