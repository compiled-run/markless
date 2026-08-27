import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './spotlight-page.tsrx';

// Gate 3. The dim is a box-shadow on a box the size of the target, so the family
// writes no geometry and installs no listener - and the shadow is not
// hit-testable, which decides both what elementFromPoint answers and where an
// outside press has to be heard.
//
// The overlay behaviour keeps a document-wide count that outlives the container,
// so every marked element is hidden through the transition it watches before the
// container goes.
afterEach(async () => {
	try {
		for (const surface of [...document.querySelectorAll<HTMLElement>('[overlay]')].reverse()) {
			surface.hidden = true;
		}
		await new Promise((resolve) => setTimeout(resolve, 0));
	} finally {
		cleanup();
		(globalThis as { __marklessOverlayPrimedDismissal?: unknown }).__marklessOverlayPrimedDismissal =
			undefined;
	}
});

function parts(container: ParentNode) {
	const find = <T extends HTMLElement>(selector: string): T => {
		const node = container.querySelector<T>(selector);
		if (!node) throw new Error(`Expected "${selector}".`);
		return node;
	};
	return {
		target: find<HTMLButtonElement>('[data-tg-target]'),
		backdrop: find('[data-tg-backdrop]'),
		behind: find('[data-tg-behind]'),
		card: find('[data-tg-card]'),
		start: find<HTMLButtonElement>('[data-tg-start]'),
		catchPresses: find<HTMLButtonElement>('[data-tg-hit]'),
		dismissals: find('[data-tg-dismissals]'),
		pressed: find('[data-tg-pressed]'),
	};
}

function sameBox(a: DOMRect, b: DOMRect): boolean {
	return (
		Math.abs(a.top - b.top) <= 1 &&
		Math.abs(a.left - b.left) <= 1 &&
		Math.abs(a.width - b.width) <= 1 &&
		Math.abs(a.height - b.height) <= 1
	);
}

function centreOf(node: HTMLElement) {
	const box = node.getBoundingClientRect();
	return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
}

async function expectTheBackdropTakesTheTargetBox(container: ParentNode) {
	const { target, backdrop, start } = parts(container);
	expect(sameBox(backdrop.getBoundingClientRect(), target.getBoundingClientRect())).toBe(false);

	start.click();

	await expect
		.poll(() => sameBox(backdrop.getBoundingClientRect(), target.getBoundingClientRect()))
		.toBe(true);

	// 100vmax of spread on a box that small reaches past every edge of the
	// viewport, which is the whole of the dim: no path is built and no rect is
	// measured to get it.
	const box = backdrop.getBoundingClientRect();
	const spread = Math.max(window.innerWidth, window.innerHeight);
	expect(box.left - spread).toBeLessThanOrEqual(0);
	expect(box.top - spread).toBeLessThanOrEqual(0);
	expect(box.right + spread).toBeGreaterThanOrEqual(window.innerWidth);
	expect(box.bottom + spread).toBeGreaterThanOrEqual(window.innerHeight);
	const spreadPx = Number.parseFloat(
		window.getComputedStyle(backdrop).boxShadow.match(/([\d.]+)px\)?$/)?.[1] ?? '0',
	);
	expect(spreadPx).toBeGreaterThanOrEqual(spread);
}

test('CSR: the backdrop takes the target box from the anchor and dims past every edge', async () => {
	const screen = await render(Page);
	await expectTheBackdropTakesTheTargetBox(screen.container as HTMLElement);
});

test('SSR resume: the same backdrop takes the same box', async () => {
	const screen = await renderSSR(Page);
	await expectTheBackdropTakesTheTargetBox(screen.container as HTMLElement);
});

// The border box IS the hole, so pointer-events decide exactly the wrong thing:
// with `auto` the spotlight swallows the target it is meant to reveal, and the
// dim - painted by a shadow - still lets presses through. `none` is the only
// setting that leaves the target pressable.
test('CSR: the dim is not hit-testable, and pointer-events on the hole read backwards', async () => {
	const screen = await render(Page);
	const container = screen.container as HTMLElement;
	const { target, backdrop, behind, start, catchPresses } = parts(container);
	start.click();
	await expect
		.poll(() => sameBox(backdrop.getBoundingClientRect(), target.getBoundingClientRect()))
		.toBe(true);

	const onTarget = centreOf(target);
	const inTheDim = { x: onTarget.x, y: Math.max(0, onTarget.y - 120) };

	expect(document.elementFromPoint(onTarget.x, onTarget.y)).toBe(target);
	expect(document.elementFromPoint(inTheDim.x, inTheDim.y)).toBe(behind);

	catchPresses.click();
	await expect.poll(() => backdrop.hasAttribute('ui-hit')).toBe(true);

	expect(document.elementFromPoint(onTarget.x, onTarget.y)).toBe(backdrop);
	expect(document.elementFromPoint(inTheDim.x, inTheDim.y)).toBe(behind);
});

// So nothing paints over the page to catch a press, and nothing needs to: the
// overlay primitive reports outside presses from a document capture listener.
async function expectTheOutsidePressIsHeard(container: ParentNode) {
	const { behind, card, start, dismissals, pressed } = parts(container);
	start.click();
	await expect.poll(() => card.hidden).toBe(false);
	// Enlistment rides a MutationObserver callback, so the surface is not on the
	// stack yet on the tick that showed it.
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect(dismissals.textContent).toBe('0');

	behind.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

	await expect.poll(() => dismissals.textContent).toBe('1');
	expect(pressed.textContent).toBe('DIV');
}

test('CSR: a press in the dim reaches the overlay primitive', async () => {
	const screen = await render(Page);
	await expectTheOutsidePressIsHeard(screen.container as HTMLElement);
});

test('SSR resume: a press in the dim still reaches the overlay primitive', async () => {
	const screen = await renderSSR(Page);
	await expectTheOutsidePressIsHeard(screen.container as HTMLElement);
});
