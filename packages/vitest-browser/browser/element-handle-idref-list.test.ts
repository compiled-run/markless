import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSRPhased } from '../src/index.ts';
import LocalPage from './fixtures/idref-list-local.tsrx';
import ListPage from './fixtures/idref-list-page.tsrx';

// An IDREF position the platform defines as a list takes a static array of
// element() handles: the author names a description AND an error, the compiler
// mints both ids and joins them in the authored order, and a handle whose part
// never rendered drops out instead of dangling.
afterEach(() => cleanup());

function described(container: ParentNode, control: Element) {
	const ids = (control.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
	return {
		ids,
		// What a reader computes from the attribute: the referenced elements' text
		// in the order the attribute lists them.
		text: ids
			.map((id) => container.querySelector(`[id="${id}"]`)?.textContent?.trim() ?? '')
			.join(' '),
	};
}

function localField(container: ParentNode) {
	const control = container.querySelector('[data-list-control]');
	const error = container.querySelector('[data-list-error]');
	const description = container.querySelector('[data-list-description]');
	if (!control || !error || !description) throw new Error('Expected all three parts.');
	return { ...described(container, control), error, description };
}

function widgetField(container: ParentNode, name: string) {
	const root = container.querySelector(`[data-field="${name}"]`);
	const control = root?.querySelector('[data-field-control]');
	if (!root || !control) throw new Error(`Expected field ${name} to render its control.`);
	return {
		...described(root, control),
		control,
		error: root.querySelector('[data-field-error]'),
		description: root.querySelector('[data-field-description]'),
	};
}

test('CSR: one control is described by both elements, in the authored order', async () => {
	const screen = await render(LocalPage);
	const field = localField(screen.container as HTMLElement);

	expect(field.ids).toHaveLength(2);
	// The order is the order the handles were written, which is the order a
	// reader conveys them in.
	expect(field.ids).toEqual([field.error.getAttribute('id'), field.description.getAttribute('id')]);
	expect(field.ids[0]).not.toBe(field.ids[1]);
	expect(field.text).toBe('Too short At least 8 characters');
});

test('SSR: the joined pair is in the raw server HTML and survives resume unchanged', async () => {
	const phased = await renderSSRPhased(LocalPage);
	const served = /aria-describedby="([^"]+)"/.exec(phased.html)?.[1] ?? '';
	expect(served.split(' ')).toHaveLength(2);

	const field = localField(phased.mount().container);
	// Resume must not re-mint or reorder: the browser adopts the server's value.
	expect(field.ids.join(' ')).toBe(served);
	expect(field.text).toBe('Too short At least 8 characters');
});

test('CSR: a widget names only the message parts its consumer placed', async () => {
	const container = (await render(ListPage)).container as HTMLElement;
	const both = widgetField(container, 'both');
	const one = widgetField(container, 'one');
	const none = widgetField(container, 'none');

	expect(both.ids).toEqual([
		both.error?.getAttribute('id'),
		both.description?.getAttribute('id'),
	]);
	expect(both.text).toBe('Too short At least 8 characters');
	// The error part was never placed, so its handle drops out and the one that
	// rendered is named alone - not a dangling id, and not a leading space.
	expect(one.ids).toEqual([one.description?.getAttribute('id')]);
	expect(one.text).toBe('At least 8 characters');
	// Neither part rendered: no attribute at all, which is what the single-handle
	// form already does.
	expect(none.control.hasAttribute('aria-describedby')).toBe(false);
	// Two rendered widgets, two sets of ids.
	expect(both.ids[1]).not.toBe(one.ids[0]);
});

test('SSR: the served HTML omits per part, and resume keeps every id', async () => {
	const phased = await renderSSRPhased(ListPage);
	const served = [...phased.html.matchAll(/aria-describedby="([^"]*)"/g)].map(
		(match) => match[1],
	);
	// One attribute for the field naming two parts, one for the field naming one,
	// and none for the field that placed neither.
	expect(served.map((value) => value?.split(' ').length)).toEqual([2, 1]);

	const container = phased.mount().container;
	expect(widgetField(container, 'both').ids.join(' ')).toBe(served[0]);
	expect(widgetField(container, 'one').ids.join(' ')).toBe(served[1]);
	expect(widgetField(container, 'none').control.hasAttribute('aria-describedby')).toBe(false);
	expect(widgetField(container, 'both').text).toBe('Too short At least 8 characters');
});
