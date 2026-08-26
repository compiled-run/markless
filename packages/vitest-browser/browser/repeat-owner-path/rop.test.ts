import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './rop-page.tsrx';

/**
 * A component row minted below a widget root the COLLECTION does not stand
 * inside.
 *
 * The collection is a page-level cell, so the collection graph node names no
 * instance; the widget root is the panel the rows render inside. The mint
 * anchors its widget-registry walk on the collection node, finds no root from
 * there, and refuses every widget-scoped definition the row reads. Served rows
 * resolve the same widget through the render path and are correct, which is what
 * makes the refusal attributable to the anchor alone.
 *
 * Pinned at the refusal: the anchor has to become the repeat host's own graph
 * instance path, and the record carries no field spelling it. Host node ids
 * carry a HOST prefix, a different id space from the graph instance path the
 * widget registry is keyed by - the two coincide on some trees and diverge
 * wherever a projection segment appears - so no reading of `parentHostNodeId`
 * answers it. Once the path is carried, these two flip to a fourth row per panel
 * whose owner is that panel.
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

test('CSR: the row appended after render is refused, not minted', async () => {
	const screen = await render(Page);
	const container = screen.container as HTMLElement;

	add(container);
	await expect
		.poll(() => refusals)
		.toContain('MARKLESS_REPEAT_ROW_COMPONENT_WIDGET_UNRESOLVED');
	expect(rows(container, 'data-rop-left')).toEqual(['alpha', 'bravo', 'charlie']);
});

test('SSR: a resumed page refuses the same row for the same reason', async () => {
	const screen = await renderSSR(Page);
	const container = screen.container as HTMLElement;

	expect(owners(container, 'data-rop-left')).toEqual(['left', 'left', 'left']);

	add(container);
	await expect
		.poll(() => refusals, { timeout: 5000 })
		.toContain('MARKLESS_REPEAT_ROW_COMPONENT_WIDGET_UNRESOLVED');
	expect(rows(container, 'data-rop-left')).toEqual(['alpha', 'bravo', 'charlie']);
});
