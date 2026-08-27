import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { danglingIdrefs } from '../idref-per-instance/idrefs.ts';
import IdrefInArmPage from './idref-in-arm-page.tsrx';
import IdrefInArmOpenPage from './idref-in-arm-open-page.tsrx';

// An IDREF naming an element() handle a flippable @if arm binds. The id is
// minted for the rendered widget, so the flip reads it off the record the render
// resolved; the attribute follows the arm, and never names nothing.
afterEach(() => cleanup());

function parts(container: ParentNode, label: string) {
	const widget = container.querySelector<HTMLElement>(`[data-widget][data-label="${label}"]`);
	if (!widget) throw new Error(`No widget labelled "${label}".`);
	return {
		widget,
		toggle: widget.querySelector<HTMLButtonElement>('[data-toggle]')!,
		panel: () => widget.querySelector<HTMLElement>('[data-panel]'),
		controls: () => widget.querySelector<HTMLElement>('[data-toggle]')!.getAttribute('aria-controls'),
	};
}

async function expectClosed(container: ParentNode, label: string) {
	const { panel, controls } = parts(container, label);
	// A flip is async, so closing is polled exactly as opening is: asserting the
	// arm is gone the instant after the click reads the DOM before the flip lands.
	await expect
		.poll(() => panel(), { timeout: 2000 })
		.toBe(null);
	await expect
		.poll(() => controls(), { timeout: 2000 })
		.toBe(null);
	expect(danglingIdrefs(container)).toEqual([]);
}

async function expectOpen(container: ParentNode, label: string) {
	const { panel, controls } = parts(container, label);
	await expect.poll(() => panel(), { timeout: 2000 }).not.toBe(null);
	await expect.poll(() => controls(), { timeout: 2000 }).not.toBe(null);
	expect(panel()!.id, `${label} panel carries the minted id`).not.toBe('');
	expect(controls()).toBe(panel()!.id);
	expect(danglingIdrefs(container)).toEqual([]);
}

async function expectPresenceFollowsTheArm(container: ParentNode, servedOpen: boolean) {
	if (!servedOpen) {
		await expectClosed(container, 'one');
		parts(container, 'one').toggle.click();
	}
	await expectOpen(container, 'one');

	// The second instance is untouched by the first one's flip, and its own id
	// is its own: two widgets on one page never name each other's panel.
	if (!servedOpen) await expectClosed(container, 'two');
	else await expectOpen(container, 'two');

	parts(container, 'one').toggle.click();
	await expectClosed(container, 'one');

	parts(container, 'one').toggle.click();
	await expectOpen(container, 'one');
	if (servedOpen) {
		expect(parts(container, 'one').controls()).not.toBe(parts(container, 'two').controls());
	}
}

test('CSR served closed: aria-controls appears with the arm and leaves with it', async () => {
	const screen = await render(IdrefInArmPage);
	await expectPresenceFollowsTheArm(screen.container as HTMLElement, false);
});

// Red until a page composing a childless widget root passes its seeds down at server render (mintsElementHandleId scans only the module's own chunks).
test.fails('SSR resume served closed: aria-controls appears with the arm and leaves with it', async () => {
	const screen = await renderSSR(IdrefInArmPage);
	await expectPresenceFollowsTheArm(screen.container as HTMLElement, false);
});

test.fails('CSR served open: the painted arm is named, and each instance names its own', async () => {
	const screen = await render(IdrefInArmOpenPage);
	await expectPresenceFollowsTheArm(screen.container as HTMLElement, true);
});

test.fails('SSR resume served open: the painted arm is named, and each instance names its own', async () => {
	const screen = await renderSSR(IdrefInArmOpenPage);
	await expectPresenceFollowsTheArm(screen.container as HTMLElement, true);
});
