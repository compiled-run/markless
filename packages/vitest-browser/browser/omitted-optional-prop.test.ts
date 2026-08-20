import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import DirectApp from './fixtures/optional-prop-direct.tsrx';
import BarrelApp from './fixtures/optional-prop-barrel.tsrx';

// A prop the invocation site never passes has no route in the parent's prop
// table. The child already rendered its final (absent) value, so composition
// has nothing live to wire — reached directly or through a barrel.
afterEach(() => cleanup());

function expectOmittedPropRendered(container: ParentNode) {
	const part = container.querySelector<HTMLButtonElement>('[data-optional-part]');
	expect(part).not.toBeNull();
	expect(part?.textContent).toBe('x');
	expect(part?.hasAttribute('disabled')).toBe(false);
}

test('CSR: a directly imported child renders with an omitted optional prop', async () => {
	const screen = await render(DirectApp);
	expectOmittedPropRendered(screen.container as HTMLElement);
});

test('SSR: a directly imported child renders with an omitted optional prop', async () => {
	const screen = await renderSSR(DirectApp);
	expectOmittedPropRendered(screen.container);
});

test('CSR: a barrel-reached child renders with an omitted optional prop', async () => {
	const screen = await render(BarrelApp);
	expectOmittedPropRendered(screen.container as HTMLElement);
});

test('SSR: a barrel-reached child renders with an omitted optional prop', async () => {
	const screen = await renderSSR(BarrelApp);
	expectOmittedPropRendered(screen.container);
});

test('SSR: a barrel-reached child spreads its remaining props onto its host element', async () => {
	const screen = await renderSSR(BarrelApp);
	expect(
		screen.container.querySelector('[data-spread-part]')?.getAttribute('title'),
	).toBe('forwarded');
});
