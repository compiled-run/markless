import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import App from './fixtures/trigger-toggle.tsrx';

// A part projected into a compound root owns its own state and its own event.
// Clicking the trigger must flip the attribute the trigger renders, on a client
// mount and after a server render resumes.
afterEach(() => cleanup());

function trigger(container: ParentNode) {
	return container
		.querySelector('[data-testid="trigger-toggle"]')
		?.querySelector<HTMLButtonElement>('button');
}

async function expectTogglesChecked(container: ParentNode) {
	expect(trigger(container)?.hasAttribute('ui-checked')).toBe(false);

	trigger(container)?.click();
	await expect.poll(() => trigger(container)?.hasAttribute('ui-checked')).toBe(true);

	trigger(container)?.click();
	await expect.poll(() => trigger(container)?.hasAttribute('ui-checked')).toBe(false);
}

test('CSR: a projected trigger toggles its own checked attribute', async () => {
	const screen = await render(App);
	await expectTogglesChecked(screen.container as HTMLElement);
});

test('SSR: a projected trigger toggles its own checked attribute after resume', async () => {
	const screen = await renderSSR(App);
	await expectTogglesChecked(screen.container);
});
