import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSRPhased } from '../src/index.ts';
import LocalPage from './fixtures/idref-local-page.tsrx';
import WidgetPage from './fixtures/idref-widget-page.tsrx';

// An element() handle in an IDREF position is a relationship, not a value: the
// compiler mints the id, writes it on the element `el=` bound and on every
// position that named the handle, and the author never sees the string.
afterEach(() => cleanup());

function localPair(container: ParentNode) {
	const label = container.querySelector<HTMLLabelElement>('[data-local-label]');
	const trigger = container.querySelector<HTMLButtonElement>('[data-local-trigger]');
	if (!label || !trigger) throw new Error('Expected the label and the trigger.');
	return { for: label.getAttribute('for'), id: trigger.getAttribute('id') };
}

function widgetPairs(container: ParentNode) {
	return ['a', 'b'].map((name) => {
		const root = container.querySelector(`[data-widget="${name}"]`);
		const label = root?.querySelector<HTMLLabelElement>('[data-widget-label]');
		const trigger = root?.querySelector<HTMLButtonElement>('[data-widget-trigger]');
		if (!label || !trigger) throw new Error(`Expected widget ${name} to render both parts.`);
		return { for: label.getAttribute('for'), id: trigger.getAttribute('id') };
	});
}

test('CSR: a plain component mints one id for both sides of the relationship', async () => {
	const screen = await render(LocalPage);
	const pair = localPair(screen.container as HTMLElement);
	expect(pair.id).toBeTruthy();
	expect(pair.for).toBe(pair.id);
	// The label really resolves to the button, which is what an IDREF is for.
	expect(
		(screen.container as HTMLElement).querySelector<HTMLLabelElement>('[data-local-label]')
			?.control,
	).toBe((screen.container as HTMLElement).querySelector('[data-local-trigger]'));
});

test('SSR: the pair matches in the raw server HTML and survives resume unchanged', async () => {
	const phased = await renderSSRPhased(LocalPage);
	const id = /<button[^>]*\bid="([^"]+)"/.exec(phased.html)?.[1];
	const labelFor = /<label[^>]*\bfor="([^"]+)"/.exec(phased.html)?.[1];
	expect(id).toBeTruthy();
	expect(labelFor).toBe(id);

	const screen = phased.mount();
	const pair = localPair(screen.container);
	// Resume must not re-mint: the browser adopts the server's id as it stands.
	expect(pair.id).toBe(id);
	expect(pair.for).toBe(id);
});

test('CSR: two widgets on one page mint distinct ids for their own triggers', async () => {
	const screen = await render(WidgetPage);
	const [first, second] = widgetPairs(screen.container as HTMLElement);
	expect(first!.id).toBeTruthy();
	expect(first!.for).toBe(first!.id);
	expect(second!.for).toBe(second!.id);
	// The whole point of widget scope: one rendered widget, one id.
	expect(first!.id).not.toBe(second!.id);
});

test('SSR: each widget label points at its own trigger in the raw server HTML', async () => {
	const phased = await renderSSRPhased(WidgetPage);
	const ids = [...phased.html.matchAll(/<button[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
	const fors = [...phased.html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map((match) => match[1]);
	expect(ids).toHaveLength(2);
	expect(fors).toEqual(ids);
	expect(ids[0]).not.toBe(ids[1]);

	const screen = phased.mount();
	const pairs = widgetPairs(screen.container);
	expect(pairs.map((pair) => pair.id)).toEqual(ids);
	expect(pairs.map((pair) => pair.for)).toEqual(ids);
});
