import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import IdrefPerInstancePage from './idref-per-instance-page.tsrx';
import { danglingIdrefs } from './idrefs.ts';

// An IDREF attribute's presence belongs to the reading INSTANCE, not the module:
// an instance that binds no host for the handle writes no attribute at all,
// because an id naming nothing is what `aria-valid-attr-value` reports.
//
// Three top-level instances of one family, only one of which places the panel.
afterEach(() => cleanup());

function widget(container: ParentNode, label: string) {
	const found = container.querySelector<HTMLElement>(`[data-widget][data-label="${label}"]`);
	if (!found) throw new Error(`No widget labelled "${label}".`);
	return found;
}

function panel(container: ParentNode, label: string) {
	return container.querySelector<HTMLElement>(`[data-panel][data-for="${label}"]`);
}

function expectPerInstancePresence(container: ParentNode) {
	const boundPanel = panel(container, 'bound');
	if (!boundPanel) throw new Error('The "bound" instance rendered no panel.');
	expect(boundPanel.id).not.toBe('');
	expect(widget(container, 'bound').getAttribute('aria-controls')).toBe(boundPanel.id);

	for (const label of ['bare-one', 'bare-two']) {
		expect(panel(container, label), `${label} renders no panel`).toBe(null);
		expect(
			widget(container, label).hasAttribute('aria-controls'),
			`${label} writes no aria-controls`,
		).toBe(false);
	}

	expect(danglingIdrefs(container)).toEqual([]);
}

test('CSR: only the instance that binds the handle writes the IDREF', async () => {
	const screen = await render(IdrefPerInstancePage);
	expectPerInstancePresence(screen.container as HTMLElement);
});

test('SSR resume: only the instance that binds the handle writes the IDREF', async () => {
	const screen = await renderSSR(IdrefPerInstancePage);
	expectPerInstancePresence(screen.container as HTMLElement);
});
