import { page } from 'vite-plus/test/browser';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import AloofPage from './aloof-page.tsrx';
import EmptyPage from './empty-page.tsrx';
import FirstResolverPage from './first-resolver-page.tsrx';
import NestedPage from './nested-page.tsrx';
import SeededPage from './no-writer-page.tsrx';

/**
 * A widget-scope `shared()` collection no component body ever writes, pushed to
 * by a sibling part's handler.
 *
 * The first three shapes are green and are the floor a fix must not break: no
 * body writer is NOT an ingredient, and neither is an empty seed. The failing
 * shapes differ in one thing only — which component of the family module the
 * page renders outermost. The cells of a widget-scoped definition go to the
 * first component in its module that resolves it, and only a composed child
 * carrying those cells registers a widget root, so a page whose outermost part
 * is some other component roots the widget nowhere: the part's read answers
 * undefined and the handler's `[...box.items, 'gamma']` throws
 * `context.graph.read is not a function or its return value is not iterable`.
 *
 * That throw is an unhandled rejection, which fails the whole file, so it is
 * captured below and the rows assert instead of dying. The mechanism and the
 * two owning functions are in
 * goals/headless-components/notes/U715-shared-collection-no-body-writer.md.
 */
afterEach(() => cleanup());

const thrown: string[] = [];

beforeEach(() => {
	thrown.length = 0;
	const note = (reason: unknown) => {
		thrown.push(String((reason as { readonly message?: string } | null)?.message ?? reason));
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

async function takesTheWrite(seeded: ReadonlyArray<string>) {
	expect(fieldValues()).toEqual(seeded);
	click('add');
	await expect.poll(() => count()).toBe(String(seeded.length + 1));
	await expect.poll(() => fieldValues()).toEqual([...seeded, 'gamma']);
	expect(el('field').getAttribute('ui-seen')).toBe('gamma added');
	expect(thrown).toEqual([]);
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

	// Pinned: the definition's cells went to a component this page never renders,
	// so no composed child registers a widget root, the part's read stays in page
	// space where no cell exists, and the handler's spread of undefined throws.
	test.fails(
		`${mode}: a sibling writer reaches a widget whose cell-owning component never renders`,
		async () => {
			if (mode === 'CSR') await render(AloofPage);
			else await renderSSR(AloofPage);

			await takesTheWrite([]);
		},
	);

	// Pinned at the same mechanism: nesting the writer inside a part that does
	// resolve the definition roots nothing either, because rooting follows the
	// cells rather than the render tree.
	test.fails(
		`${mode}: a nested writer reaches a widget whose cell-owning component never renders`,
		async () => {
			if (mode === 'CSR') await render(NestedPage);
			else await renderSSR(NestedPage);

			await takesTheWrite([]);
		},
	);
}
