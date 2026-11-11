import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import ArmBranchEscalate from './fixtures/arm-branch-escalate.tsrx';
import ArmBranchFlip from './fixtures/arm-branch-flip.tsrx';
import ArmBranchFlipFirstFail from './fixtures/arm-branch-flip-first-fail.tsrx';
import { resetPanelRenders } from './fixtures/panel-render-probe.ts';

// T104: @if/@switch INSIDE async boundary arms get real flip machinery (D1
// tier 3) — a menu toggle replaces only the branch's own range and must NOT
// re-render the whole @try content. When the @if contains a component the
// toggle escalates to the boundary's arm re-render but still works (D2).
afterEach(() => {
	cleanup();
	resetPanelRenders();
});

function requireElement<T extends Element>(container: HTMLElement, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return element;
}

test('SSR: a sync-state @if inside @try opens AND closes without re-rendering the arm (tier-3 proof)', async () => {
	const screen = await renderSSR(ArmBranchFlip);
	const container = screen.container as HTMLElement;

	// Settled arm rendered, drawer closed.
	expect(container.querySelector('[data-drawer]')).toBeNull();
	const renderCountAfterLoad = requireElement<HTMLSpanElement>(
		container,
		'[data-render-count]',
	).textContent;

	// Open: only the branch range flips in — rows render from the graph.
	requireElement<HTMLButtonElement>(container, 'button[data-drawer-toggle]').click();
	await expect.poll(() => container.querySelectorAll('.drawer-item').length).toBe(2);
	expect(
		Array.from(container.querySelectorAll('.drawer-item'), (item) => item.textContent),
	).toEqual(['west-kestrel', 'west-osprey']);

	// Close: the branch range flips back out.
	requireElement<HTMLButtonElement>(container, 'button[data-drawer-toggle]').click();
	await expect.poll(() => container.querySelector('[data-drawer]')).toBeNull();

	// The tier-3 proof: neither toggle re-executed the arm render — the probe
	// only runs when the whole @try content renders.
	expect(requireElement<HTMLSpanElement>(container, '[data-render-count]').textContent).toBe(
		renderCountAfterLoad,
	);
});

test('SSR: a refresh and the recovery from a failed refresh keep the arm and its flip', async () => {
	const screen = await renderSSR(ArmBranchFlip);
	const container = screen.container as HTMLElement;
	const renderCount = () => requireElement<HTMLSpanElement>(container, '[data-render-count]').textContent;
	const toggle = () => requireElement<HTMLButtonElement>(container, 'button[data-drawer-toggle]');
	const renderCountAfterLoad = renderCount();

	// A write the async computed reads re-runs it: the arm updates in place, the probe stays put.
	const toggleAtLoad = toggle();
	requireElement<HTMLButtonElement>(container, 'button[data-region]').click();
	await expect.poll(() => toggle().textContent?.trim()).toBe('east crews');
	expect(toggle()).toBe(toggleAtLoad);
	expect(renderCount()).toBe(renderCountAfterLoad);
	toggle().click();
	await expect
		.poll(() => Array.from(container.querySelectorAll('.drawer-item'), (item) => item.textContent))
		.toEqual(['east-kestrel', 'east-osprey']);
	toggle().click();
	await expect.poll(() => container.querySelector('[data-drawer]')).toBeNull();

	// A failed run shows @catch after the kept arm; the next good one updates that arm in place, so the probe stays put.
	requireElement<HTMLButtonElement>(container, 'button[data-lost]').click();
	await expect.poll(() => container.querySelector('.broken')).not.toBeNull();
	expect(toggle()).toBe(toggleAtLoad);
	requireElement<HTMLButtonElement>(container, 'button[data-region]').click();
	await expect.poll(() => container.querySelector('.broken')).toBeNull();
	expect(toggle().textContent?.trim()).toBe('east crews');
	expect(toggle()).toBe(toggleAtLoad);
	expect(renderCount()).toBe(renderCountAfterLoad);

	// The kept arm's flip still answers.
	toggle().click();
	await expect.poll(() => container.querySelectorAll('.drawer-item').length).toBe(2);
	expect(renderCount()).toBe(renderCountAfterLoad);
	toggle().click();
	await expect.poll(() => container.querySelector('[data-drawer]')).toBeNull();
});

test('SSR: a first load that fails then succeeds commits the arm and rewires its flip against the fresh anchors', async () => {
	const screen = await renderSSR(ArmBranchFlipFirstFail);
	const container = screen.container as HTMLElement;
	const toggle = () => requireElement<HTMLButtonElement>(container, 'button[data-drawer-toggle]');
	await expect.poll(() => container.querySelector('.broken')).not.toBeNull();
	expect(container.querySelector('[data-render-count]')).toBeNull();

	requireElement<HTMLButtonElement>(container, 'button[data-region]').click();
	await expect.poll(() => container.querySelector('[data-drawer-toggle]')?.textContent?.trim()).toBe('east crews');
	expect(container.querySelector('.broken')).toBeNull();
	const renderCountAfterCommit = requireElement<HTMLSpanElement>(container, '[data-render-count]').textContent;

	// The committed arm's flip must be wired against the fresh anchors, and toggling it must not re-render the arm.
	toggle().click();
	await expect.poll(() => container.querySelectorAll('.drawer-item').length).toBe(2);
	expect(
		Array.from(container.querySelectorAll('.drawer-item'), (item) => item.textContent),
	).toEqual(['east-kestrel', 'east-osprey']);
	expect(requireElement<HTMLSpanElement>(container, '[data-render-count]').textContent).toBe(renderCountAfterCommit);
	toggle().click();
	await expect.poll(() => container.querySelector('[data-drawer]')).toBeNull();
});

test('SSR: an @if containing a component still toggles via the whole-arm re-render (escalation works)', async () => {
	const screen = await renderSSR(ArmBranchEscalate);
	const container = screen.container as HTMLElement;

	expect(container.querySelector('[data-badge]')).toBeNull();

	requireElement<HTMLButtonElement>(container, 'button[data-details-toggle]').click();
	await expect.poll(() => container.querySelector('[data-badge]')?.textContent).toBe('Q3 report');

	requireElement<HTMLButtonElement>(container, 'button[data-details-toggle]').click();
	await expect.poll(() => container.querySelector('[data-badge]')).toBeNull();
});
