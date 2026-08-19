import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import StaticApp from './fixtures/trigger-props.tsrx';
import ReactiveApp from './fixtures/trigger-reactive.tsrx';

// A part reached through the package barrel must route its own props onto the
// element it hosts: as a static value, and as a live binding the parent flips.
afterEach(() => cleanup());

function trigger(container: ParentNode, testid: string) {
	return container
		.querySelector(`[data-testid="${testid}"]`)
		?.querySelector<HTMLButtonElement>('button:not([data-flip])');
}

function expectStaticDisabled(container: ParentNode) {
	const button = trigger(container, 'trigger-props');
	expect(button).not.toBeNull();
	expect(button?.getAttribute('disabled')).toBe('');
	expect(button?.getAttribute('ui-disabled')).toBe('');
}

async function expectFlipsDisabled(container: ParentNode) {
	const button = trigger(container, 'trigger-reactive');
	expect(button?.hasAttribute('disabled')).toBe(false);
	expect(button?.hasAttribute('ui-disabled')).toBe(false);

	container.querySelector<HTMLButtonElement>('[data-flip]')?.click();

	await expect.poll(() => trigger(container, 'trigger-reactive')?.hasAttribute('disabled')).toBe(true);
	expect(trigger(container, 'trigger-reactive')?.getAttribute('ui-disabled')).toBe('');

	container.querySelector<HTMLButtonElement>('[data-flip]')?.click();

	await expect.poll(() => trigger(container, 'trigger-reactive')?.hasAttribute('disabled')).toBe(false);
	expect(trigger(container, 'trigger-reactive')?.hasAttribute('ui-disabled')).toBe(false);
}

test('CSR: a barrel-reached part forwards a static prop onto its host element', async () => {
	const screen = await render(StaticApp);
	expectStaticDisabled(screen.container as HTMLElement);
});

test('SSR: a barrel-reached part forwards a static prop onto its host element', async () => {
	const screen = await renderSSR(StaticApp);
	expectStaticDisabled(screen.container);
});

test('CSR: a prop bound to parent state flips the attributes the part forwards', async () => {
	const screen = await render(ReactiveApp);
	await expectFlipsDisabled(screen.container as HTMLElement);
});

test('SSR: a prop bound to parent state flips the attributes the part forwards', async () => {
	const screen = await renderSSR(ReactiveApp);
	await expectFlipsDisabled(screen.container);
});
