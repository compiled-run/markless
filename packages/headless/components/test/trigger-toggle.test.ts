import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import App from './fixtures/trigger-toggle.tsrx';

// The family renders its checked state on the root (`ui-checked`) and on the
// trigger (`aria-checked`). The flip after a click is NOT asserted here: a
// widget-scoped shared computed does not refresh a part's DOM after a write
// (T037), so the toggle is recorded as blocked in notes/parity-table.md.
afterEach(() => cleanup());

function root(container: ParentNode) {
	return container.querySelector('[data-testid="trigger-toggle"] div');
}

function trigger(container: ParentNode) {
	return container.querySelector<HTMLButtonElement>('[data-testid="trigger-toggle"] button');
}

function expectUncheckedRender(container: ParentNode) {
	expect(root(container)?.hasAttribute('ui-checked')).toBe(false);
	expect(trigger(container)?.getAttribute('aria-checked')).toBe('false');
	expect(trigger(container)?.getAttribute('role')).toBe('checkbox');
}

test('CSR: an unchecked family renders ui-checked absent and aria-checked false', async () => {
	const screen = await render(App);
	expectUncheckedRender(screen.container as HTMLElement);
});

test('SSR: an unchecked family renders ui-checked absent and aria-checked false', async () => {
	const screen = await renderSSR(App);
	expectUncheckedRender(screen.container);
});
