import { cleanup, render, renderSSR } from '../src/index.ts';
import { afterEach, expect, test } from 'vitest';
import App from './fixtures/arm-handler-prop.tsrx';

// T057: the component in the flippable arm is handed a FUNCTION. That function
// is not markup — it wires the child's records — and the bound capture symbol
// for the edge exists whether or not the arm is open. So the flip rebuilds the
// child from compiled markup and its button still calls the caller's handler
// with the caller's own state captured.

afterEach(cleanup);

function pane(container: ParentNode) {
	return {
		toggle: container.querySelector('[data-toggle]') as HTMLButtonElement,
		picks: container.querySelector('[data-picks]') as HTMLElement,
		panel: () => container.querySelector('[data-panel]') as HTMLElement | null,
		pick: () => container.querySelector('[data-pick]') as HTMLButtonElement | null,
		label: () => container.querySelector('[data-label]')?.textContent,
	};
}

test('CSR: a flip-mounted child fires the function it was handed, capture intact', async () => {
	const screen = await render(App);
	const { toggle, picks, panel, pick, label } = pane(screen.container as HTMLElement);

	expect(panel()).toBeNull();

	toggle.click();
	await expect.poll(panel).not.toBeNull();
	expect(label()).toBe('ready');

	pick()!.click();
	await expect.poll(() => picks.textContent).toBe('1');

	pick()!.click();
	await expect.poll(() => picks.textContent).toBe('2');

	// Unmounting releases the child's routes: the button is gone with its markup.
	toggle.click();
	await expect.poll(panel).toBeNull();

	// Remounting rewires the same edge against the value the page holds NOW.
	toggle.click();
	await expect.poll(panel).not.toBeNull();
	pick()!.click();
	await expect.poll(() => picks.textContent).toBe('3');
});

test('SSR: an arm closed at first render mounts its handler child after resume', async () => {
	const screen = await renderSSR(App);
	const { toggle, picks, panel, pick } = pane(screen.container as HTMLElement);

	expect(panel()).toBeNull();

	toggle.click();
	await expect.poll(panel).not.toBeNull();

	pick()!.click();
	await expect.poll(() => picks.textContent).toBe('1');

	toggle.click();
	await expect.poll(panel).toBeNull();
});
