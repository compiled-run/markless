import { page } from 'vite-plus/test/browser';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import AloofPage from './aloof-page.tsrx';
import EmptyPage from './empty-page.tsrx';
import FirstResolverPage from './first-resolver-page.tsrx';
import NestedPage from './nested-page.tsrx';
import SeededPage from './no-writer-page.tsrx';
import RootlessPage from './rootless-page.tsrx';
import SeededRootPage from './seeded-page.tsrx';

/**
 * A widget-scope `shared()` collection no component body ever writes, pushed to
 * by a sibling part's handler.
 *
 * No body writer is not an ingredient, and neither is an empty seed. What used
 * to separate the rows was which component of the family module the page
 * renders outermost: the cells of a widget-scoped definition went to one
 * component, and only a composed child carrying them registered a widget root,
 * so a page whose outermost part was some other component rooted the widget
 * nowhere and the handler's `[...box.items, 'gamma']` spread undefined.
 *
 * A family nothing seeds now hands its cells to every component that resolves
 * it, and the compiler marks the extra carriers so only the designated root
 * composes as one. The refusal is a throw, so the adder catches it and records
 * the name on `data-refused`, and the rows read that record.
 */
afterEach(() => cleanup());

// A refusal that escapes a handler is reported to the host as an uncaught error,
// which the runner attributes to whichever row it is on when the report lands -
// so an escape here fails an innocent neighbour instead of this file. Anything
// this collects is that defect, not a passing row.
const escaped: string[] = [];

beforeEach(() => {
	escaped.length = 0;
	const note = (reason: unknown) => {
		escaped.push(String((reason as { readonly message?: string } | null)?.message ?? reason));
		return true;
	};
	const onRejection = (event: PromiseRejectionEvent) => {
		if (note(event.reason)) event.preventDefault();
	};
	const onError = (event: ErrorEvent) => {
		if (note(event.error ?? event.message)) event.preventDefault();
	};
	window.addEventListener('unhandledrejection', onRejection);
	window.addEventListener('error', onError);
	return () => {
		window.removeEventListener('unhandledrejection', onRejection);
		window.removeEventListener('error', onError);
	};
});

const el = (testid: string) => page.getByTestId(testid).element() as HTMLElement;
const fieldValues = () => [...el('field').querySelectorAll('input')].map((one) => one.value);
const count = () => el('field').getAttribute('ui-count');
const click = (testid: string) => (el(testid) as HTMLButtonElement).click();
const ran = () => el('adder').getAttribute('data-ran');
const refused = () => el('adder').getAttribute('data-refused');

async function takesTheWrite(seeded: ReadonlyArray<string>) {
	expect(fieldValues()).toEqual(seeded);
	click('add');
	await expect.poll(() => count()).toBe(String(seeded.length + 1));
	await expect.poll(() => fieldValues()).toEqual([...seeded, 'gamma']);
	expect(el('field').getAttribute('ui-seen')).toBe('gamma added');
	expect(escaped).toEqual([]);
}

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: a handler write reaches a seeded collection no body ever writes`, async () => {
		if (mode === 'CSR') await render(SeededPage);
		else await renderSSR(SeededPage);

		await takesTheWrite(['alpha', 'beta']);
	});

	test(`${mode}: the same write reaches a collection seeded empty`, async () => {
		if (mode === 'CSR') await render(EmptyPage);
		else await renderSSR(EmptyPage);

		await takesTheWrite([]);
	});

	test(`${mode}: a root that resolves nothing is fine when the outermost part owns the cells`, async () => {
		if (mode === 'CSR') await render(FirstResolverPage);
		else await renderSSR(FirstResolverPage);

		await takesTheWrite([]);
	});

	// Pins marked rooting: nothing seeds this family, so every component that
	// resolves it carries the cells and only the designated root composes as a
	// widget root. The sibling parts of a page that renders none of them are the
	// one instance of the family on the page.
	test(`${mode}: a sibling writer reaches a widget whose cell-owning component never renders`, async () => {
		if (mode === 'CSR') await render(AloofPage);
		else await renderSSR(AloofPage);

		await takesTheWrite([]);
	});

	test(`${mode}: a nested writer reaches a widget whose cell-owning component never renders`, async () => {
		if (mode === 'CSR') await render(NestedPage);
		else await renderSSR(NestedPage);

		await takesTheWrite([]);
	});

	// Still unresolved, and pinned so it stays visible. This page renders a part
	// of a family whose cells only its SEEDING root owns, and that root is
	// nowhere - so the handler's `[...box.items, 'gamma']` spreads undefined and
	// V8 spells that "context.graph.read is not a function or its return value is
	// not iterable". Refusing it by name needs a signal composition does not have:
	// a part of a family declared in its own module whose cells went to a
	// component the page never rendered, and a part ADOPTING a family declared in
	// another module - which is page-wide on purpose and green today in
	// browser/adopted-family-derives - reach composition looking identical, each
	// shipping the definition record and carrying none of its cells.
	test.fails(`${mode}: a part whose family rendered no root or carrier names its failure`, async () => {
		if (mode === 'CSR') await render(RootlessPage);
		else await renderSSR(RootlessPage);

		click('add');

		await expect.poll(() => refused()).toMatch(/MARKLESS_WIDGET_INSTANCE_UNRESOLVED/);
	});

	test(`${mode}: that page reads undefined rather than writing into the void`, async () => {
		if (mode === 'CSR') await render(RootlessPage);
		else await renderSSR(RootlessPage);

		expect(fieldValues()).toEqual([]);
		click('add');

		// The refusal names the read, not the instance, and the handler ran and
		// caught it - so nothing reached the collection and nothing escaped.
		await expect.poll(() => ran()).toBe('1');
		expect(refused()).toContain('is not a function or its return value is not iterable');
		expect(fieldValues()).toEqual([]);
		expect(count()).toBe('0');
		expect(el('field').getAttribute('ui-seen')).toBe('');
		expect(escaped).toEqual([]);
	});

	test(`${mode}: the same part takes the write once its family's root renders`, async () => {
		if (mode === 'CSR') await render(SeededRootPage);
		else await renderSSR(SeededRootPage);

		expect(fieldValues()).toEqual(['alpha', 'beta']);
		click('add');
		await expect.poll(() => count()).toBe('3');
		await expect.poll(() => fieldValues()).toEqual(['alpha', 'beta', 'gamma']);
		expect(refused()).toBe('');
		expect(escaped).toEqual([]);
	});
}
