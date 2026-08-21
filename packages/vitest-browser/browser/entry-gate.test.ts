import { cleanup, render, renderSSR } from '../src/index.ts';
import { afterEach, expect, test } from 'vitest';
import App from './fixtures/entry-gate.tsrx';

// Entry gate: lowercase compound tags reached through this package's own
// barrel must render inside @markless/ui, not only in the compiler fixtures.
afterEach(() => cleanup());

// Library parts carry no data-* hooks, so the parts are located through the
// element the fixture owns and then by the tag and text each part renders.
function expectPartsMounted(container: ParentNode) {
	const host = container.querySelector('[data-testid="entry-gate"]');
	expect(host).not.toBeNull();
	const root = host?.querySelector('div');
	expect(root).not.toBeNull();
	const trigger = root?.querySelector<HTMLButtonElement>('button');
	expect(trigger).not.toBeNull();
	expect(trigger?.getAttribute('type')).toBe('button');
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
