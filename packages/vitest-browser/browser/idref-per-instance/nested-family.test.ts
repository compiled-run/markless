import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import NestedFamilyPage from './nested-family-page.tsrx';
import { danglingIdrefs } from './idrefs.ts';

// The menu shape: the widget root of the inner family is itself a part of the
// enclosing one, and the part it names is written inside it. Only the item that
// places the content part has an element for the handle; the plain commands
// must write no IDREF at all.
afterEach(() => cleanup());

const PLAIN = ['plain-one', 'plain-two', 'deep-one', 'deep-two'] as const;

function item(container: ParentNode, label: string) {
	const found = container.querySelector<HTMLElement>(`[data-item][data-label="${label}"]`);
	if (!found) throw new Error(`No item labelled "${label}".`);
	return found;
}

function expectPerInstancePresence(container: ParentNode) {
	const content = container.querySelector<HTMLElement>('[data-content][data-for="nesting"]');
	if (!content) throw new Error('The nesting item rendered no content.');
	expect(content.id).not.toBe('');
	expect(item(container, 'nesting').getAttribute('aria-controls')).toBe(content.id);

	for (const label of PLAIN)
		expect(
			item(container, label).hasAttribute('aria-controls'),
			`${label} writes no aria-controls`,
		).toBe(false);

	expect(danglingIdrefs(container)).toEqual([]);
}

// Pinned as expected-fail, not hidden. The enclosing widget's seed phase walks
// its whole projection and files one roster entry per handle any part under it
// binds - including handles of the INNER family, reached by walking through the
// nesting item's own projection. Every inner instance then inherits that map, so
// a plain command reads "bound" for a handle its own instance never bound and
// writes an id resolving to nothing. Dropping the enclosing widget makes the
// same items correct: see no-bar.test.ts. These flip red once presence is
// per instance; delete the `.fails` then.
test.fails('CSR: only the nesting item writes the IDREF to its content', async () => {
	const screen = await render(NestedFamilyPage);
	expectPerInstancePresence(screen.container as HTMLElement);
});

test.fails('SSR resume: only the nesting item writes the IDREF to its content', async () => {
	const screen = await renderSSR(NestedFamilyPage);
	expectPerInstancePresence(screen.container as HTMLElement);
});
