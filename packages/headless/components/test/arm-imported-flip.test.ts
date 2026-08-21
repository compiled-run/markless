import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import App from './fixtures/arm-imported-flip.tsrx';

// T056: the component in the flippable arm comes from ANOTHER FILE, so its
// markup is not in the page module's render data at all. Its own module
// publishes that markup on its interface, and the flip rebuilds the arm from it
// with the caller's props substituted in. The child never runs.
//
// The value it shows is decided by the caller: a value that CHANGES after the
// child is shown refreshes through records the child's module owns, which this
// module cannot address, so the build refuses that shape instead of showing it
// once and leaving it stale (proven at the compiler boundary in
// @markless/compiler's arm-branch-flips.test.ts).

afterEach(cleanup);

function pane(container: ParentNode) {
	return {
		toggle: container.querySelector('[data-toggle]') as HTMLButtonElement,
		bump: container.querySelector('[data-bump]') as HTMLButtonElement,
		clicks: container.querySelector('[data-clicks]') as HTMLElement,
		panel: () => container.querySelector('[data-panel]') as HTMLElement | null,
		label: () => container.querySelector('[data-label]')?.textContent,
	};
}

test('CSR: an imported component in a flippable arm mounts and unmounts', async () => {
	const screen = await render(App);
	const { toggle, bump, clicks, panel, label } = pane(screen.container as HTMLElement);

	expect(panel()).toBeNull();

	toggle.click();
	await expect.poll(panel).not.toBeNull();
	expect(label()).toBe('ready');

	toggle.click();
	await expect.poll(panel).toBeNull();

	// The page around the arm keeps working across the flip.
	bump.click();
	await expect.poll(() => clicks.textContent).toBe('1');
	expect(panel()).toBeNull();

	toggle.click();
	await expect.poll(panel).not.toBeNull();
	expect(label()).toBe('ready');
});

test('SSR: an arm closed at first render mounts its imported component after resume', async () => {
	const screen = await renderSSR(App);
	const { toggle, bump, clicks, panel, label } = pane(screen.container as HTMLElement);

	expect(panel()).toBeNull();

	toggle.click();
	await expect.poll(label).toBe('ready');

	bump.click();
	await expect.poll(() => clicks.textContent).toBe('1');

	toggle.click();
	await expect.poll(panel).toBeNull();
});
