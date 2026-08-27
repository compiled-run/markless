import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import HandleInArmPage from './handle-in-arm-page.tsrx';
import ServedOpenPage from './served-open-page.tsrx';

// An element() handle bound inside a flippable @if arm. Presence follows the
// arm: undefined while the arm is gone, the live element while it is rendered,
// and undefined again once the flip takes it away.
afterEach(() => cleanup());

function parts(container: ParentNode) {
	const widget = container.querySelector<HTMLElement>('[data-widget]');
	if (!widget) throw new Error('No widget rendered.');
	return {
		widget,
		toggle: widget.querySelector<HTMLButtonElement>('[data-toggle]')!,
		probe: widget.querySelector<HTMLButtonElement>('[data-probe]')!,
		panel: () => widget.querySelector<HTMLElement>('[data-panel]'),
	};
}

async function expectPresenceFollowsTheArm(container: ParentNode, servedOpen: boolean) {
	const { widget, toggle, probe, panel } = parts(container);

	if (!servedOpen) {
		expect(panel(), 'the closed arm renders no panel').toBe(null);
		probe.click();
		await expect.poll(() => widget.getAttribute('data-mark')).toBe('unbound');

		toggle.click();
		await expect.poll(() => panel()).not.toBe(null);
	} else {
		expect(panel(), 'the served-open arm renders the panel').not.toBe(null);
	}

	// Bound: the handler reaches the element the arm rendered and marks it.
	probe.click();
	await expect.poll(() => widget.getAttribute('data-mark')).toBe('bound');
	const probes = widget.getAttribute('data-probes')!;
	expect(panel()!.getAttribute('data-probed')).toBe(probes);

	// Flip closed: the arm's element leaves, and the handle goes with it.
	toggle.click();
	await expect.poll(() => panel()).toBe(null);
	probe.click();
	await expect.poll(() => widget.getAttribute('data-mark')).toBe('unbound');

	// And back: a second open files a fresh binding rather than doubling the
	// first, which the registry would refuse as two rendered widgets.
	toggle.click();
	await expect.poll(() => panel()).not.toBe(null);
	probe.click();
	await expect.poll(() => widget.getAttribute('data-mark')).toBe('bound');
	expect(panel()!.getAttribute('data-probed')).toBe(widget.getAttribute('data-probes'));
}

test('CSR served closed: the handle binds and unbinds with the arm', async () => {
	const screen = await render(HandleInArmPage);
	await expectPresenceFollowsTheArm(screen.container as HTMLElement, false);
});

test('SSR resume served closed: the handle binds and unbinds with the arm', async () => {
	const screen = await renderSSR(HandleInArmPage);
	await expectPresenceFollowsTheArm(screen.container as HTMLElement, false);
});

test('CSR served open: the painted arm files its handle at startup', async () => {
	const screen = await render(ServedOpenPage);
	await expectPresenceFollowsTheArm(screen.container as HTMLElement, true);
});

test('SSR resume served open: the painted arm files its handle at startup', async () => {
	const screen = await renderSSR(ServedOpenPage);
	await expectPresenceFollowsTheArm(screen.container as HTMLElement, true);
});
