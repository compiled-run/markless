import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import Page from './page.tsrx';

// Childless sibling parts that each root a widget-scoped shared() instance
// inside one enclosing widget are separate instances: each mints its own id and
// names it by IDREF, and a client render allocates both exactly as the server
// does — whether the family holds a cell or nothing but an element() handle.
afterEach(() => cleanup());

const NAMES = ['first', 'second', 'third', 'fourth'];

function thumbIds(container: ParentNode) {
	return NAMES.map((name) => {
		const thumb = container.querySelector<HTMLElement>(`[data-thumb="${name}"]`);
		if (!thumb) throw new Error(`No thumb named "${name}".`);
		return {
			name,
			labelledBy: thumb.getAttribute('aria-labelledby'),
			labelId: thumb.querySelector('span')?.id ?? null,
		};
	});
}

function expectOwnIds(ids: ReturnType<typeof thumbIds>) {
	for (const { labelledBy, labelId } of ids) {
		expect(labelId).toBeTruthy();
		expect(labelledBy).toBe(labelId);
	}
	expect(new Set(ids.map((entry) => entry.labelId)).size).toBe(ids.length);
}

test('client and server rendering give sibling instances the same distinct ids', async () => {
	const csr = thumbIds((await render(Page)).container);
	await cleanup();
	const ssr = thumbIds((await renderSSR(Page)).container);

	expectOwnIds(ssr);
	expectOwnIds(csr);
	expect(csr).toEqual(ssr);
});
