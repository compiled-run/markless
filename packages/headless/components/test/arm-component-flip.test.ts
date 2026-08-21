import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import App from './fixtures/arm-component-flip.tsrx';

// T054: a flippable @if arm that holds a component which has to run. The lift is
// general, not seed-specific: this fixture has no widget in it. The component's
// markup is render data like any other chunk, so the flip rebuilds it from the
// child's own statics with the caller's props substituted in, and the child's
// records rewire in the arm's own coordinate space.

afterEach(cleanup);

function pane(container: ParentNode) {
	return {
		toggle: container.querySelector('[data-toggle]') as HTMLButtonElement,
		bump: container.querySelector('[data-bump]') as HTMLButtonElement,
		clicks: container.querySelector('[data-clicks]') as HTMLElement,
		panel: () => container.querySelector('[data-panel]') as HTMLElement | null,
		label: () => container.querySelector('[data-label]')?.textContent,
		count: () => container.querySelector('[data-count]')?.textContent,
	};
}

test('CSR: a component in a flippable arm mounts, refreshes, and unmounts', async () => {
	const screen = await render(App);
	const { toggle, bump, clicks, panel, label, count } = pane(screen.container as HTMLElement);

	expect(panel()).toBeNull();

	toggle.click();
	await expect.poll(panel).not.toBeNull();
	expect(label()).toBe('ready');
	expect(count()).toBe('0');

	// The child the flip built carries live records: a write the parent makes
	// refreshes the text inside it.
	bump.click();
	await expect.poll(count).toBe('1');

	toggle.click();
	await expect.poll(panel).toBeNull();

	// The removed child kept no live record: writing again touches nothing.
	bump.click();
	await expect.poll(() => clicks.textContent).toBe('2');
	expect(panel()).toBeNull();

	// Flipping back rebuilds the child against the value it has NOW.
	toggle.click();
	await expect.poll(count).toBe('2');
	expect(label()).toBe('ready');
});

test('SSR: an arm closed at first render mounts its component after resume', async () => {
	const screen = await renderSSR(App);
	const { toggle, bump, panel, count } = pane(screen.container as HTMLElement);

	expect(panel()).toBeNull();

	toggle.click();
	await expect.poll(count).toBe('0');

	bump.click();
	await expect.poll(count).toBe('1');

	toggle.click();
	await expect.poll(panel).toBeNull();
});
