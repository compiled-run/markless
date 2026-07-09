import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ArmBranchEscalate from './fixtures/arm-branch-escalate.tsrx';
import ArmBranchFlip from './fixtures/arm-branch-flip.tsrx';
import NestedSwitchEvents from './fixtures/arm-nested-switch-events.tsrx';
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

test('SSR: the flip rewires after a real arm re-commit (no stale subscriptions, no leaks)', async () => {
	const screen = await renderSSR(ArmBranchFlip);
	const container = screen.container as HTMLElement;

	const renderCountAfterLoad = requireElement<HTMLSpanElement>(
		container,
		'[data-render-count]',
	).textContent;

	// A write the async computed reads re-runs it: the whole arm re-commits
	// (tier 4) — the probe MUST move here, proving it can detect arm renders.
	requireElement<HTMLButtonElement>(container, 'button[data-region]').click();
	await expect
		.poll(() => container.querySelector('button[data-drawer-toggle]')?.textContent?.trim())
		.toBe('east crews');
	const renderCountAfterCommit = requireElement<HTMLSpanElement>(
		container,
		'[data-render-count]',
	).textContent;
	expect(renderCountAfterCommit).not.toBe(renderCountAfterLoad);

	// The re-committed arm's flip must be rewired against the fresh anchors.
	requireElement<HTMLButtonElement>(container, 'button[data-drawer-toggle]').click();
	await expect.poll(() => container.querySelectorAll('.drawer-item').length).toBe(2);
	expect(
		Array.from(container.querySelectorAll('.drawer-item'), (item) => item.textContent),
	).toEqual(['east-kestrel', 'east-osprey']);

	// And the toggle still did not re-render the arm.
	expect(requireElement<HTMLSpanElement>(container, '[data-render-count]').textContent).toBe(
		renderCountAfterCommit,
	);

	requireElement<HTMLButtonElement>(container, 'button[data-drawer-toggle]').click();
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

test('CSR: nested @switch handlers inside a settled @try arm stay wired after opening the panel', async () => {
	const screen = await render(NestedSwitchEvents);
	const container = screen.container as HTMLElement;

	await expect.poll(() => container.querySelector('button[data-open]')?.textContent).toBe('Moorings');

	requireElement<HTMLButtonElement>(container, 'button[data-open]').click();
	await expect.poll(() => container.querySelector('[data-mooring-panel]')).not.toBeNull();
	expect(container.querySelector('[data-berths]')).not.toBeNull();

	requireElement<HTMLButtonElement>(container, 'button[data-tab-docks]').click();
	await expect.poll(() => container.querySelector('[data-docks]')).not.toBeNull();

	requireElement<HTMLButtonElement>(container, 'button[data-dock-row]').click();
	await expect.poll(() => container.querySelector('[data-picked]')?.textContent).toBe('dock');

	requireElement<HTMLButtonElement>(container, 'button[data-close]').click();
	await expect.poll(() => container.querySelector('[data-mooring-panel]')).toBeNull();
});
