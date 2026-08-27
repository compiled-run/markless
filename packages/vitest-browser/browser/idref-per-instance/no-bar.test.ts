import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import NoBarPage from './no-bar-page.tsrx';
import { danglingIdrefs } from './idrefs.ts';

// Bisect for nested-family: the same items with no enclosing widget above them.
afterEach(() => cleanup());

function idrefOf(container: ParentNode, label: string) {
	const found = container.querySelector<HTMLElement>(`[data-item][data-label="${label}"]`);
	if (!found) throw new Error(`No item labelled "${label}".`);
	return found.getAttribute('aria-controls');
}

function expectPerInstancePresence(container: ParentNode) {
	const content = container.querySelector<HTMLElement>('[data-content]');
	if (!content) throw new Error('The nesting item rendered no content.');
	expect(idrefOf(container, 'nesting')).toBe(content.id);
	expect(idrefOf(container, 'plain-one')).toBe(null);
	expect(idrefOf(container, 'plain-two')).toBe(null);
	expect(danglingIdrefs(container)).toEqual([]);
}

test('CSR: with no enclosing widget, only the nesting item writes the IDREF', async () => {
	const screen = await render(NoBarPage);
	expectPerInstancePresence(screen.container as HTMLElement);
});

test('SSR resume: with no enclosing widget, only the nesting item writes the IDREF', async () => {
	const screen = await renderSSR(NoBarPage);
	expectPerInstancePresence(screen.container as HTMLElement);
});
