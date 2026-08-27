import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import RootIdrefPage from './root-idref-page.tsrx';

// An IDREF between a widget root's OWN element and a part it seeds has to name
// the right instance in both directions: each root controls its own panel, and
// each panel is labelled by its own root, with a third instance rooted inside
// the first one's panel.
afterEach(() => cleanup());

const LABELS = ['one', 'nested', 'two'] as const;

function pairs(container: ParentNode) {
	const roots = [...container.querySelectorAll<HTMLElement>('[data-disclosure]')];
	const panels = [...container.querySelectorAll<HTMLElement>('[data-panel]')];
	if (roots.length !== 3 || panels.length !== 3)
		throw new Error(`Expected 3 roots and 3 panels, saw ${roots.length} and ${panels.length}.`);
	return LABELS.map((label) => {
		const root = roots.find((candidate) => candidate.dataset.label === label);
		const panel = panels.find((candidate) => candidate.dataset.for === label);
		if (!root || !panel) throw new Error(`No root/panel pair for "${label}".`);
		return { label, root, panel };
	});
}

function expectOwnIdrefs(container: ParentNode) {
	const found = pairs(container);
	const ids = new Set<string>();

	for (const { label, root, panel } of found) {
		expect(root.id, `root id for ${label}`).not.toBe('');
		expect(panel.id, `panel id for ${label}`).not.toBe('');
		ids.add(root.id);
		ids.add(panel.id);
		expect(root.getAttribute('aria-controls'), `aria-controls for ${label}`).toBe(panel.id);
		expect(panel.getAttribute('aria-labelledby'), `aria-labelledby for ${label}`).toBe(root.id);
	}

	// Six distinct ids: a token shared between two instances would collapse them.
	expect(ids.size).toBe(6);
}

test('CSR: each root controls its own panel and each panel names its own root', async () => {
	const screen = await render(RootIdrefPage);
	expectOwnIdrefs(screen.container as HTMLElement);
});

test('SSR resume: each root controls its own panel and each panel names its own root', async () => {
	const screen = await renderSSR(RootIdrefPage);
	expectOwnIdrefs(screen.container as HTMLElement);
});

function expectNestedIsOwn(container: ParentNode) {
	const [outer, nested] = pairs(container);
	if (!outer || !nested) throw new Error('Expected the outer and nested pairs.');
	// The nested root sits inside the outer panel, so a token that leaked from the
	// enclosing instance would make these two relationships identical.
	expect(nested.root.id).not.toBe(outer.root.id);
	expect(nested.panel.id).not.toBe(outer.panel.id);
	expect(outer.panel.contains(nested.root)).toBe(true);
}

test('CSR: a nested instance inside a panel resolves to its own', async () => {
	const screen = await render(RootIdrefPage);
	expectNestedIsOwn(screen.container as HTMLElement);
});

test('SSR resume: a nested instance inside a panel resolves to its own', async () => {
	const screen = await renderSSR(RootIdrefPage);
	expectNestedIsOwn(screen.container as HTMLElement);
});
