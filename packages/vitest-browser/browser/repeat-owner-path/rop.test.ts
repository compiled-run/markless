import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './rop-page.tsrx';

/**
 * A component row minted below a widget root the COLLECTION does not stand
 * inside.
 *
 * The collection is a page-level cell, so the collection graph node names no
 * instance; the widget root is the panel the rows render inside. The mint
 * anchors its widget-registry walk on the live host census, so the panel whose
 * element holds the repeat's parent names the instance the rows stand in, and a
 * row is keyed on the repeat's OWN instance path rather than the collection's,
 * so two family roots over one collection spell two different rows.
 */
afterEach(async () => {
	await cleanup();
});

const refusals: string[] = [];

beforeEach(() => {
	refusals.length = 0;
	const note = (reason: unknown) => {
		const code = (reason as { readonly code?: string } | null)?.code;
		if (typeof code !== 'string') return false;
		refusals.push(code);
		return true;
	};
	const onRejection = (event: PromiseRejectionEvent) => {
		if (note(event.reason)) event.preventDefault();
	};
	const onError = (event: ErrorEvent) => {
		if (note(event.error)) event.preventDefault();
	};
	window.addEventListener('unhandledrejection', onRejection);
	window.addEventListener('error', onError);
	return () => {
		window.removeEventListener('unhandledrejection', onRejection);
		window.removeEventListener('error', onError);
	};
});

function rows(container: ParentNode, side: string) {
	return [...container.querySelectorAll<HTMLElement>(`[${side}] [data-rop-row]`)].map((row) =>
		row.getAttribute('data-rop-value'),
	);
}

function owners(container: ParentNode, side: string) {
	return [...container.querySelectorAll<HTMLElement>(`[${side}] [data-rop-row]`)].map((row) =>
		row.getAttribute('data-rop-owner'),
	);
}

function add(container: ParentNode) {
	const node = container.querySelector<HTMLButtonElement>('[data-rop-add]');
	if (!node) throw new Error('Expected the add button.');
	node.click();
}

test('CSR: served rows read the panel root they stand inside', async () => {
	const screen = await render(Page);
	const container = screen.container as HTMLElement;

	expect(rows(container, 'data-rop-left')).toEqual(['alpha', 'bravo', 'charlie']);
	expect(owners(container, 'data-rop-left')).toEqual(['left', 'left', 'left']);
	expect(owners(container, 'data-rop-right')).toEqual(['right', 'right', 'right']);
});

test('CSR: the row appended after render mints under the panel it stands in', async () => {
	const screen = await render(Page);
	const container = screen.container as HTMLElement;

	add(container);
	await expect
		.poll(() => rows(container, 'data-rop-left'))
		.toEqual(['alpha', 'bravo', 'charlie', 'delta']);
	expect(owners(container, 'data-rop-left')).toEqual(['left', 'left', 'left', 'left']);
});

test('CSR: two panels over one collection each mint their own fourth row', async () => {
	const screen = await render(Page);
	const container = screen.container as HTMLElement;

	add(container);
	await expect
		.poll(() => rows(container, 'data-rop-right'))
		.toEqual(['alpha', 'bravo', 'charlie', 'delta']);
	expect(owners(container, 'data-rop-right')).toEqual(['right', 'right', 'right', 'right']);
	expect(refusals).not.toContain('MARKLESS_REPEAT_ROW_COMPONENT_WIDGET_COLLISION');
});

test('SSR: a resumed page mints the appended row under the panel it stands in', async () => {
	const screen = await renderSSR(Page);
	const container = screen.container as HTMLElement;

	expect(owners(container, 'data-rop-left')).toEqual(['left', 'left', 'left']);

	add(container);
	await expect
		.poll(() => rows(container, 'data-rop-left'), { timeout: 5000 })
		.toEqual(['alpha', 'bravo', 'charlie', 'delta']);
	expect(owners(container, 'data-rop-left')).toEqual(['left', 'left', 'left', 'left']);
});

test('SSR: two panels over one collection each mint their own fourth row', async () => {
	const screen = await renderSSR(Page);
	const container = screen.container as HTMLElement;

	add(container);
	await expect
		.poll(() => rows(container, 'data-rop-right'), { timeout: 5000 })
		.toEqual(['alpha', 'bravo', 'charlie', 'delta']);
	expect(owners(container, 'data-rop-right')).toEqual(['right', 'right', 'right', 'right']);
	expect(refusals).not.toContain('MARKLESS_REPEAT_ROW_COMPONENT_WIDGET_COLLISION');
});
