import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import App from './fixtures/entry-gate.tsrx';

// Entry gate: lowercase compound tags reached through this package's own
// barrel must render inside @markless/ui, not only in the compiler fixtures.
afterEach(() => cleanup());

function expectPartsMounted(container: ParentNode) {
	const root = container.querySelector('[data-checkbox-root]');
	expect(root).not.toBeNull();
	const trigger = root?.querySelector<HTMLButtonElement>('[data-checkbox-trigger]');
	expect(trigger).not.toBeNull();
	expect(trigger?.tagName).toBe('BUTTON');
	expect(trigger?.textContent).toBe('x');
}

test('CSR: <checkbox.root>/<checkbox.trigger> render through the package barrel', async () => {
	const screen = await render(App);
	expectPartsMounted(screen.container as HTMLElement);
});

test('SSR: <checkbox.root>/<checkbox.trigger> render on the server and resume', async () => {
	const screen = await renderSSR(App);
	expectPartsMounted(screen.container);
});
