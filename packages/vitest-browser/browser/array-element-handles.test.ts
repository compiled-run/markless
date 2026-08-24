import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ArmPage from './fixtures/aeh-arm.tsrx';
import RowsPage from './fixtures/aeh-rows.tsrx';
import StaticPage from './fixtures/aeh-static-page.tsrx';
import TwoPage from './fixtures/aeh-two-page.tsrx';

// `element<HTMLDivElement[]>()` names an ordered SET of elements. The array type
// argument is the declaration; binding it on many elements is then allowed, and
// a handler reading it answers the live elements as a plain array in document
// order. Every assertion below is about that order staying true to the document
// as members are added, removed, and moved.
afterEach(() => cleanup());

function root(container: ParentNode) {
	const node = container.querySelector<HTMLElement>('[data-aeh-root]');
	if (!node) throw new Error('Expected the widget root.');
	return node;
}

function probe(container: ParentNode) {
	const node = container.querySelector<HTMLButtonElement>('[data-aeh-probe]');
	if (!node) throw new Error('Expected the probe button.');
	return node;
}

function button(container: ParentNode, attribute: string) {
	const node = container.querySelector<HTMLButtonElement>(`[${attribute}]`);
	if (!node) throw new Error(`Expected the ${attribute} button.`);
	return node;
}

function page(container: ParentNode, selector: string) {
	const node = container.querySelector<HTMLElement>(selector);
	if (!node) throw new Error(`Expected ${selector}.`);
	return node;
}

test('CSR: a handle bound on three elements reads back all three in document order', async () => {
	const screen = await render(StaticPage);
	const container = screen.container as HTMLElement;

	probe(container).click();
	await expect.poll(() => root(container).getAttribute('data-order')).toBe('alpha|beta|gamma');
	expect(root(container).getAttribute('data-count')).toBe('3');
});

test('SSR resume: the served multi-bound handle reads back all three after resume', async () => {
	const screen = await renderSSR(StaticPage);
	const container = screen.container as HTMLElement;

	probe(container).click();
	await expect.poll(() => root(container).getAttribute('data-order')).toBe('alpha|beta|gamma');
	expect(root(container).getAttribute('data-count')).toBe('3');
});

// The single-handle rule is untouched by the widening: `contentEl` beside
// `optionEls` in the same factory still resolves to its one element.
test('CSR: a single handle declared beside an array handle still answers one element', async () => {
	const screen = await render(StaticPage);
	const container = screen.container as HTMLElement;

	expect(container.querySelectorAll('[data-aeh-content]').length).toBe(1);
	expect(container.querySelectorAll('[data-aeh-option]').length).toBe(3);
});

test('CSR: two widget instances each read their own set, never the union', async () => {
	const screen = await render(TwoPage);
	const container = screen.container as HTMLElement;
	const roots = [...container.querySelectorAll<HTMLElement>('[data-aeh-root]')];
	const probes = [...container.querySelectorAll<HTMLButtonElement>('[data-aeh-probe]')];
	expect(roots.length).toBe(2);

	probes[0]!.click();
	await expect.poll(() => roots[0]!.getAttribute('data-order')).toBe('one-a|one-b');
	expect(roots[1]!.getAttribute('data-order')).toBe('');

	probes[1]!.click();
	await expect.poll(() => roots[1]!.getAttribute('data-order')).toBe('two-a|two-b');
	expect(roots[0]!.getAttribute('data-order')).toBe('one-a|one-b');
});

test('SSR resume: two instances keep their own sets apart after resume', async () => {
	const screen = await renderSSR(TwoPage);
	const container = screen.container as HTMLElement;
	const roots = [...container.querySelectorAll<HTMLElement>('[data-aeh-root]')];
	const probes = [...container.querySelectorAll<HTMLButtonElement>('[data-aeh-probe]')];

	probes[1]!.click();
	await expect.poll(() => roots[1]!.getAttribute('data-order')).toBe('two-a|two-b');
	expect(roots[0]!.getAttribute('data-order')).toBe('');
});

test('CSR: an array handle bound on a keyed row reads every row in order', async () => {
	const screen = await render(RowsPage);
	const container = screen.container as HTMLElement;
	const host = page(container, '[data-aeh-rows-page]');

	probe(container).click();
	await expect.poll(() => host.getAttribute('data-order')).toBe('alpha|beta|gamma');
});

// The reason the read walks the live rows instead of a registration list: after
// a reorder the same three elements are in a different order, and a list filed
// at resume would still answer the order they were served in.
test('CSR: the row read follows a live reorder', async () => {
	const screen = await render(RowsPage);
	const container = screen.container as HTMLElement;
	const host = page(container, '[data-aeh-rows-page]');

	button(container, 'data-aeh-reorder').click();
	await expect
		.poll(() =>
			[...container.querySelectorAll('[data-aeh-row]')]
				.map((row) => row.getAttribute('data-aeh-value'))
				.join('|'),
		)
		.toBe('gamma|alpha|beta');

	probe(container).click();
	await expect.poll(() => host.getAttribute('data-order')).toBe('gamma|alpha|beta');
});

test('CSR: a removed row leaves the set', async () => {
	const screen = await render(RowsPage);
	const container = screen.container as HTMLElement;
	const host = page(container, '[data-aeh-rows-page]');

	button(container, 'data-aeh-remove').click();
	await expect.poll(() => container.querySelectorAll('[data-aeh-row]').length).toBe(2);

	probe(container).click();
	await expect.poll(() => host.getAttribute('data-order')).toBe('alpha|gamma');
});

test('SSR resume: served rows read back in order and follow a reorder', async () => {
	const screen = await renderSSR(RowsPage);
	const container = screen.container as HTMLElement;
	const host = page(container, '[data-aeh-rows-page]');

	probe(container).click();
	await expect.poll(() => host.getAttribute('data-order')).toBe('alpha|beta|gamma');

	button(container, 'data-aeh-reorder').click();
	await expect
		.poll(() =>
			[...container.querySelectorAll('[data-aeh-row]')]
				.map((row) => row.getAttribute('data-aeh-value'))
				.join('|'),
		)
		.toBe('gamma|alpha|beta');

	probe(container).click();
	await expect.poll(() => host.getAttribute('data-order')).toBe('gamma|alpha|beta');
});

test('CSR: an @if arm member joins the set in its document position and leaves again', async () => {
	const screen = await render(ArmPage);
	const container = screen.container as HTMLElement;
	const host = page(container, '[data-aeh-arm-page]');

	probe(container).click();
	await expect.poll(() => host.getAttribute('data-order')).toBe('first|last');

	button(container, 'data-aeh-toggle').click();
	await expect.poll(() => container.querySelectorAll('[data-aeh-option]').length).toBe(3);
	probe(container).click();
	await expect.poll(() => host.getAttribute('data-order')).toBe('first|middle|last');

	button(container, 'data-aeh-toggle').click();
	await expect.poll(() => container.querySelectorAll('[data-aeh-option]').length).toBe(2);
	probe(container).click();
	await expect.poll(() => host.getAttribute('data-order')).toBe('first|last');
});

test('SSR resume: the arm member joins and leaves the set after resume', async () => {
	const screen = await renderSSR(ArmPage);
	const container = screen.container as HTMLElement;
	const host = page(container, '[data-aeh-arm-page]');

	probe(container).click();
	await expect.poll(() => host.getAttribute('data-order')).toBe('first|last');

	button(container, 'data-aeh-toggle').click();
	await expect.poll(() => container.querySelectorAll('[data-aeh-option]').length).toBe(3);
	probe(container).click();
	await expect.poll(() => host.getAttribute('data-order')).toBe('first|middle|last');
});
