import { render, renderSSR } from '@markless/vitest-browser';
import axe from 'axe-core';
import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import {
	CLOSE_THRESHOLD,
	VELOCITY_THRESHOLD,
	activeSnapOf,
	closeSign,
	decideRelease,
	hiddenDuringDrag,
	keyIntent,
	offsetText,
	openAtSnap,
	openFractionOf,
	resolveSnaps,
	stepSnap,
	velocityOf,
} from './drawer-swipe.ts';
import Basic from './scenarios/basic.tsrx';
import Controlled from './scenarios/controlled.tsrx';
import Described from './scenarios/described.tsrx';
import Nested from './scenarios/nested.tsrx';
import NonModal from './scenarios/nonmodal.tsrx';
import Panel from './scenarios/panel.tsrx';
import ServedOpen from './scenarios/served-open.tsrx';
import Snapped from './scenarios/snapped.tsrx';
import Unnamed from './scenarios/unnamed.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';
import WithoutOnChange from './scenarios/without-onchange.tsrx';

const Background = page.getByTestId('background');
const Root = page.getByTestId('root');
const Trigger = page.getByTestId('trigger');
const Backdrop = page.getByTestId('backdrop');
const Content = page.getByTestId('content');
const Title = page.getByTestId('title');
const Description = page.getByTestId('description');
const Close = page.getByTestId('close');
const Apply = page.getByTestId('apply');
const Snap = page.getByTestId('snap');
const Calls = page.getByTestId('calls');
const Order = page.getByTestId('order');
const Reported = page.getByTestId('reported');
const Opener = page.getByTestId('opener');
const Expander = page.getByTestId('expander');
const SideTrigger = page.getByTestId('side-trigger');
const SideBackdrop = page.getByTestId('side-backdrop');
const SideContent = page.getByTestId('side-content');
const TopTrigger = page.getByTestId('top-trigger');
const TopBackdrop = page.getByTestId('top-backdrop');
const TopContent = page.getByTestId('top-content');
const OuterTrigger = page.getByTestId('outer-trigger');
const OuterBackdrop = page.getByTestId('outer-backdrop');
const OuterClose = page.getByTestId('outer-close');
const InnerTrigger = page.getByTestId('inner-trigger');
const InnerBackdrop = page.getByTestId('inner-backdrop');
const InnerClose = page.getByTestId('inner-close');
const FirstTrigger = page.getByTestId('first-trigger');
const FirstBackdrop = page.getByTestId('first-backdrop');
const FirstClose = page.getByTestId('first-close');
const FirstValue = page.getByTestId('first-value');
const SecondTrigger = page.getByTestId('second-trigger');
const SecondBackdrop = page.getByTestId('second-backdrop');
const SecondValue = page.getByTestId('second-value');

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
const MODES = ['CSR', 'SSR'] as const;

// The same tags the shared conformance battery runs. Contrast is absent on
// purpose rather than by suppression: this family ships unstyled.
const AXE_TAGS = ['wcag2a', 'wcag21a'] as const;

// The overlay behaviour keeps one module-level stack for the whole page, so a row
// that leaves a surface enlisted leaves the next row's background inert.
afterEach(async () => {
	for (let unwind = 0; unwind < 4; unwind++) {
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	for (const marked of Array.from(document.body.children)) {
		marked.removeAttribute('inert');
		marked.removeAttribute('aria-hidden');
	}
	document.body.style.overflow = '';
	document.body.style.paddingRight = '';
});

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

/** The displacement the family published, as the fraction CSS multiplies by 100%. */
function offset(surface: Element): number {
	return Number.parseFloat((surface as HTMLElement).style.getPropertyValue('--offset'));
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// Where a gesture's samples start. Only the differences matter.
const GESTURE_ORIGIN = 1000;
// A flick puts its two samples a millisecond apart; a slow swipe puts half a
// second between them. Both numbers are the pointer samples the family records,
// not how long anything in this file actually took.
const FLICK_LEGS = { first: 1, last: 2 } as const;
const SLOW_LEGS = { first: 10, last: 510 } as const;

/**
 * One pointer sample.
 *
 * `timeStamp` is declared rather than left to the clock. The family divides the
 * distance between two samples by the time between them, so a row that means
 * "this swipe was fast" has to say so in the samples; leaving it to how long a
 * macrotask happened to take makes the speed the machine's, not the row's.
 */
function pointer(target: Element, type: string, x: number, y: number, time?: number) {
	const event = new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		button: 0,
		buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
		clientX: x,
		clientY: y,
		pointerType: 'mouse',
		pointerId: 1,
		isPrimary: true,
	});
	if (time !== undefined) Object.defineProperty(event, 'timeStamp', { value: time });
	target.dispatchEvent(event);
}

/**
 * A whole swipe: press on the surface, two travel samples, lift.
 *
 * The press is awaited rather than assumed. A gesture settles through a lazily
 * woken handler module, so a move dispatched straight after the press can reach
 * the family before the press did; waiting for `ui-dragging` to appear is what
 * makes the order the gesture's own. Everything after it is dispatched in one go
 * and carries its own sample times, so the release speed is the row's to state.
 */
async function swipe(
	surface: HTMLElement,
	travelX: number,
	travelY: number,
	options: { flick?: boolean; lift?: boolean; cancel?: boolean } = {},
) {
	const box = surface.getBoundingClientRect();
	const fromX = box.left + 4;
	const fromY = box.top + 4;
	const legs = options.flick === true ? FLICK_LEGS : SLOW_LEGS;

	pointer(surface, 'pointerdown', fromX, fromY, GESTURE_ORIGIN);
	await expect.poll(() => surface.hasAttribute('ui-dragging')).toBe(true);

	// Half the travel, then the rest of it: the release speed is the second half
	// over the gap between the two samples.
	pointer(
		surface,
		'pointermove',
		fromX + travelX / 2,
		fromY + travelY / 2,
		GESTURE_ORIGIN + legs.first,
	);
	pointer(surface, 'pointermove', fromX + travelX, fromY + travelY, GESTURE_ORIGIN + legs.last);

	if (options.cancel === true) {
		pointer(
			surface,
			'pointercancel',
			fromX + travelX,
			fromY + travelY,
			GESTURE_ORIGIN + legs.last,
		);
		return;
	}
	if (options.lift !== false) {
		pointer(surface, 'pointerup', fromX + travelX, fromY + travelY, GESTURE_ORIGIN + legs.last);
	}
}

function press(target: Element, key: string) {
	target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

async function expectNoAxeViolations(container: Element, phase: string) {
	const results = await axe.run(container as HTMLElement, {
		runOnly: { type: 'tag', values: [...AXE_TAGS] },
		resultTypes: ['violations'],
	});
	const reported = results.violations.map((violation) => {
		const nodes = violation.nodes.map((node) => `      ${node.html}`).join('\n');
		return `  ${violation.id} (${violation.impact ?? 'unknown impact'}): ${violation.help}\n${nodes}`;
	});
	expect(reported, `axe violations while ${phase}`).toEqual([]);
}

function scopeOf(result: { container: unknown }): Element {
	const container = result.container;
	if (!(container instanceof Element)) throw new Error('The mount handed back no DOM container.');
	return container;
}

function expectClosed(backdrop: HTMLElement, content: HTMLElement) {
	// The backdrop is the elevated element, so its showing is what the behaviour watches.
	expect(backdrop.hasAttribute('hidden')).toBe(true);
	expect(backdrop.getAttribute('ui-closed')).toBe('');
	expect(content.getAttribute('ui-closed')).toBe('');
	expect(document.contains(content)).toBe(true);
}

function expectShowing(backdrop: HTMLElement, content: HTMLElement) {
	expect(backdrop.hasAttribute('hidden')).toBe(false);
	expect(backdrop.getAttribute('ui-open')).toBe('');
	expect(content.getAttribute('ui-open')).toBe('');
}

function expectBackgroundReachable(background: HTMLElement) {
	expect(background.hasAttribute('inert')).toBe(false);
	expect(background.hasAttribute('aria-hidden')).toBe(false);
}

function expectBackgroundOutOfReach(background: HTMLElement) {
	expect(background.hasAttribute('inert')).toBe(true);
	expect(background.getAttribute('aria-hidden')).toBe('true');
}

async function openBasic() {
	el(Trigger).click();
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(false);
}

async function closeBasic() {
	el(Close).click();
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);
}

// ------------------------------------------------------------------- physics
// `drawer-swipe.ts` is a pure module and this package runs no node project, so
// the arithmetic is pinned here beside the markup, the way crop's is.

test('a snap point at or below 1 is a fraction and one above it is pixels', () => {
	expect(openFractionOf(0.5, 320)).toBe(0.5);
	expect(openFractionOf(1, 320)).toBe(1);
	expect(openFractionOf(160, 320)).toBe(0.5);
	// A pixel snap taller than the drawer cannot open it further than fully.
	expect(openFractionOf(640, 320)).toBe(1);
	// No measurement yet: the pixel snap rests fully open rather than nowhere.
	expect(openFractionOf(160, 0)).toBe(1);
});

test('the rest positions come back ascending, deduplicated, and never empty', () => {
	expect(resolveSnaps([1, 0.25, 0.6], 320).map((snap) => snap.value)).toEqual([0.25, 0.6, 1]);
	// 160px of 320 is the same place as 0.5, so only the first spelling survives.
	expect(resolveSnaps([0.5, 160], 320).map((snap) => snap.value)).toEqual([0.5]);
	expect(resolveSnaps([], 320)).toEqual([{ value: 1, open: 1 }]);
	expect(resolveSnaps([0, -1], 320)).toEqual([{ value: 1, open: 1 }]);
});

test('the rest position in force is the controlled one, else the gesture, else the seed, else the top', () => {
	const snaps = resolveSnaps([0.5, 1], 320);
	expect(activeSnapOf(0.5, 1, 1, snaps)).toBe(0.5);
	expect(activeSnapOf(undefined, 1, 0.5, snaps)).toBe(1);
	expect(activeSnapOf(undefined, undefined, 0.5, snaps)).toBe(0.5);
	expect(activeSnapOf(undefined, undefined, undefined, snaps)).toBe(1);
	// A value nobody configured is not a rest position, so the top one answers.
	expect(activeSnapOf(0.75, undefined, undefined, snaps)).toBe(1);
	expect(openAtSnap(0.5, snaps)).toBe(0.5);
});

test('the closing direction follows the anchored edge, and the inline axis follows the page', () => {
	expect(closeSign('vertical', false, false)).toBe(1);
	expect(closeSign('vertical', true, false)).toBe(-1);
	expect(closeSign('horizontal', false, false)).toBe(1);
	expect(closeSign('horizontal', true, false)).toBe(-1);
	// Right to left puts the end edge on the left, so out is the other way.
	expect(closeSign('horizontal', false, true)).toBe(-1);
	expect(closeSign('horizontal', true, true)).toBe(1);
	// The block axis does not care about the page's direction.
	expect(closeSign('vertical', false, true)).toBe(1);
});

test('a swipe in flight is measured from the grab and clamped to the drawer', () => {
	expect(hiddenDuringDrag(0, 160, 320)).toBe(0.5);
	expect(hiddenDuringDrag(0.5, -160, 320)).toBe(0);
	expect(hiddenDuringDrag(0, 640, 320)).toBe(1);
	expect(hiddenDuringDrag(0, -80, 320)).toBe(0);
	// No measurement means no travel to report rather than a division by zero.
	expect(hiddenDuringDrag(0.5, 160, 0)).toBe(0.5);
});

test('a move that took no measurable time keeps the speed it had', () => {
	expect(velocityOf(20, 10, 0)).toBe(2);
	expect(velocityOf(20, 0, 0.75)).toBe(0.75);
	expect(velocityOf(-20, 10, 0)).toBe(-2);
});

test('a slow release closes only past the threshold and otherwise takes the nearest rest position', () => {
	const one = resolveSnaps([1], 320);
	expect(decideRelease(0.4, 0, 0, one, CLOSE_THRESHOLD)).toEqual({ close: true, snap: 1 });
	expect(decideRelease(0.1, 0, 0, one, CLOSE_THRESHOLD)).toEqual({ close: false, snap: 1 });
	// Exactly at the threshold closes, so the documented number is the boundary.
	expect(decideRelease(CLOSE_THRESHOLD, 0, 0, one, CLOSE_THRESHOLD).close).toBe(true);

	const two = resolveSnaps([0.5, 1], 320);
	expect(decideRelease(0.3, 0, 0, two, CLOSE_THRESHOLD)).toEqual({ close: false, snap: 0.5 });
	expect(decideRelease(0.1, 0.5, 0, two, CLOSE_THRESHOLD)).toEqual({ close: false, snap: 1 });
	// Past the lowest rest position by more than a quarter of it.
	expect(decideRelease(0.9, 0.5, 0, two, CLOSE_THRESHOLD)).toEqual({ close: true, snap: 0.5 });
	expect(decideRelease(0.55, 0.5, 0, two, CLOSE_THRESHOLD)).toEqual({ close: false, snap: 0.5 });
});

test('a flick steps exactly one rest position, and closes when there is none left', () => {
	const two = resolveSnaps([0.5, 1], 320);
	// Grabbed fully open, flicked toward closed: one step down, not a dismissal.
	expect(decideRelease(0.05, 0, VELOCITY_THRESHOLD, two, CLOSE_THRESHOLD)).toEqual({
		close: false,
		snap: 0.5,
	});
	// Grabbed at the lowest rest position with nothing under it: closed.
	expect(decideRelease(0.55, 0.5, VELOCITY_THRESHOLD, two, CLOSE_THRESHOLD)).toEqual({
		close: true,
		snap: 0.5,
	});
	// Flicked the other way: one step up.
	expect(decideRelease(0.45, 0.5, -VELOCITY_THRESHOLD, two, CLOSE_THRESHOLD)).toEqual({
		close: false,
		snap: 1,
	});
	// Under the cutoff it is an ordinary slow release again.
	expect(decideRelease(0.05, 0, VELOCITY_THRESHOLD - 0.01, two, CLOSE_THRESHOLD)).toEqual({
		close: false,
		snap: 1,
	});
});

test('an arrow key means toward open or toward closed, never a compass direction', () => {
	// A bottom sheet: up opens it, down puts it away.
	expect(keyIntent('ArrowUp', 'vertical', false, false)).toBe(1);
	expect(keyIntent('ArrowDown', 'vertical', false, false)).toBe(-1);
	// A top sheet: the same two keys, the other way round.
	expect(keyIntent('ArrowUp', 'vertical', true, false)).toBe(-1);
	expect(keyIntent('ArrowDown', 'vertical', true, false)).toBe(1);
	// A start-anchored side panel in a left-to-right page opens rightward.
	expect(keyIntent('ArrowRight', 'horizontal', true, false)).toBe(1);
	expect(keyIntent('ArrowLeft', 'horizontal', true, false)).toBe(-1);
	// The same panel in a right-to-left page opens leftward.
	expect(keyIntent('ArrowLeft', 'horizontal', true, true)).toBe(1);
	// Off the drawer's axis, and off the arrows entirely.
	expect(keyIntent('ArrowLeft', 'vertical', false, false)).toBe(0);
	expect(keyIntent('Home', 'vertical', false, false)).toBe(0);
});

test('the snap walk stops at either end rather than cycling', () => {
	const three = resolveSnaps([0.25, 0.6, 1], 320);
	expect(stepSnap(0.25, three, 1)).toBe(0.6);
	expect(stepSnap(0.6, three, 1)).toBe(1);
	expect(stepSnap(1, three, 1)).toBe(1);
	expect(stepSnap(0.25, three, -1)).toBe(0.25);
	// A value that is not a rest position moves nowhere.
	expect(stepSnap(0.4, three, 1)).toBe(0.4);
});

test('the published displacement is unitless and rounded', () => {
	expect(offsetText(0)).toBe('--offset: 0');
	expect(offsetText(0.5)).toBe('--offset: 0.5');
	expect(offsetText(1 / 3)).toBe('--offset: 0.3333');
	expect(offsetText(2)).toBe('--offset: 1');
	expect(offsetText(-1)).toBe('--offset: 0');
});

// --------------------------------------------------------------- the markup

function expectBasicRendered() {
	const backdrop = el<HTMLElement>(Backdrop);
	const content = el<HTMLElement>(Content);
	expectClosed(backdrop, content);
	expect(content.getAttribute('role')).toBe('dialog');
	expect(content.getAttribute('aria-modal')).toBe('true');
	expect(content.getAttribute('tabindex')).toBe('-1');
	expect(content.getAttribute('ui-orientation')).toBe('vertical');
	expect(content.hasAttribute('ui-start')).toBe(false);
	// One rest position, and it is fully open, so nothing is displaced.
	expect(offset(content)).toBe(0);
	expect(el(Trigger).getAttribute('type')).toBe('button');
	expect(el(Trigger).getAttribute('aria-haspopup')).toBe('dialog');
	expect(el(Title).id).toBeTruthy();
	expect(content.getAttribute('aria-labelledby')).toBe(el(Title).id);
	expect(content.textContent).toContain('Narrow these results');
	expectBackgroundReachable(el(Background));
	expect(el(Root).getAttribute('ui-closed')).toBe('');
	expect(el(Root).getAttribute('ui-orientation')).toBe('vertical');
	// The root destructured `open`, so it never reaches the element as an attribute.
	expect(el(Root).hasAttribute('open')).toBe(false);
	expect(el(Root).hasAttribute('snapPoints')).toBe(false);
}

for (const mode of MODES) {
	test(`${mode}: the starter renders a closed bottom sheet wired to its trigger`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test(`${mode}: a described drawer points at its description`, async () => {
		if (mode === 'CSR') await render(Described);
		else await renderSSR(Described);
		expect(el(Description).id).toBeTruthy();
		expect(el(Content).getAttribute('aria-describedby')).toBe(el(Description).id);
		expect(el(Content).getAttribute('aria-labelledby')).toBe(el(Title).id);
	});

	test(`${mode}: a drawer with no naming parts omits the references entirely`, async () => {
		if (mode === 'CSR') await render(Unnamed);
		else await renderSSR(Unnamed);
		expect(el(Content).hasAttribute('aria-labelledby')).toBe(false);
		expect(el(Content).hasAttribute('aria-describedby')).toBe(false);
	});

	test(`${mode}: the two other edges render as their own axis and side`, async () => {
		if (mode === 'CSR') await render(Panel);
		else await renderSSR(Panel);
		const side = el<HTMLElement>(SideContent);
		expect(side.getAttribute('ui-orientation')).toBe('horizontal');
		expect(side.getAttribute('ui-start')).toBe('');
		const top = el<HTMLElement>(TopContent);
		expect(top.getAttribute('ui-orientation')).toBe('vertical');
		expect(top.getAttribute('ui-start')).toBe('');
	});

	test(`${mode}: a non-modal drawer carries no aria-modal`, async () => {
		if (mode === 'CSR') await render(NonModal);
		else await renderSSR(NonModal);
		expect(el(Content).getAttribute('role')).toBe('dialog');
		expect(el(Content).hasAttribute('aria-modal')).toBe(false);
	});

	test(`${mode}: a drawer with rest positions starts at its seeded one`, async () => {
		if (mode === 'CSR') await render(Snapped);
		else await renderSSR(Snapped);
		// Half open before it is fully open, and the fraction needs no measurement.
		expect(offset(el(Content))).toBe(0.5);
		expect(el(Snap).textContent).toBe('');
	});

	test(`${mode}: the trigger opens the drawer and the close button closes it`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		expectClosed(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));
		await openBasic();

		expectShowing(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));
		expectBackgroundOutOfReach(el(Background));
		expect(el(Root).getAttribute('ui-open')).toBe('');
		await expect.poll(() => document.activeElement).toBe(el(Content));
		expect(document.body.style.overflow).toBe('hidden');

		await closeBasic();

		expectClosed(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));
		expectBackgroundReachable(el(Background));
		expect(document.body.style.overflow).toBe('');
		await expect.poll(() => document.activeElement).toBe(el(Trigger));
	});

	test(`${mode}: Escape closes the drawer and hands focus back`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await openBasic();

		await userEvent.keyboard('{Escape}');
		await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);
		expectBackgroundReachable(el(Background));
		await expect.poll(() => document.activeElement).toBe(el(Trigger));
	});

	test(`${mode}: a click calls the consumer onChange once with the next value`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);

		expect(el(Calls).textContent).toBe('0');
		el(FirstTrigger).click();
		await expect.poll(() => el(FirstValue).textContent).toBe('true');
		await expect.poll(() => el(Calls).textContent).toBe('1');
		// The family's own work lands before the consumer's click handler runs.
		await expect.poll(() => el(Order).textContent).toBe('change-click');
		expect(el(SecondValue).textContent).toBe('');

		el(FirstClose).click();
		await expect.poll(() => el(FirstValue).textContent).toBe('false');
		await expect.poll(() => el(Calls).textContent).toBe('2');
	});

	test(`${mode}: an omitted onChange opens and closes the drawer anyway`, async () => {
		if (mode === 'CSR') await render(WithoutOnChange);
		else await renderSSR(WithoutOnChange);
		await openBasic();
		expect(el(Calls).textContent).toBe('0');
		await closeBasic();
		expect(el(Calls).textContent).toBe('0');
	});
}

// ---------------------------------------------------------------- the swipe

test('CSR: a swipe past the close threshold closes the drawer and hands focus back', async () => {
	await render(Basic);
	await openBasic();
	const content = el<HTMLElement>(Content);
	const size = content.getBoundingClientRect().height;
	expect(size).toBeGreaterThan(100);

	await swipe(content, 0, size * 0.4);

	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);
	expectClosed(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));
	expectBackgroundReachable(el(Background));
	await expect.poll(() => document.activeElement).toBe(el(Trigger));
	// Reopening starts where a first open would, not where the swipe left it.
	expect(offset(el(Content))).toBe(0);
});

test('CSR: a swipe short of the close threshold springs back to the rest position', async () => {
	await render(Basic);
	await openBasic();
	const content = el<HTMLElement>(Content);
	const size = content.getBoundingClientRect().height;

	await swipe(content, 0, size * 0.1);

	await expect.poll(() => content.hasAttribute('ui-dragging')).toBe(false);
	expect(el(Backdrop).hasAttribute('hidden')).toBe(false);
	expect(offset(content)).toBe(0);
});

test('CSR: a flick closes a drawer that barely moved', async () => {
	await render(Basic);
	await openBasic();
	const content = el<HTMLElement>(Content);
	const size = content.getBoundingClientRect().height;

	// A tenth of the way down is well under the quarter a slow release needs.
	await swipe(content, 0, size * 0.1, { flick: true });

	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);
});

test('CSR: the surface follows the pointer while the swipe is in flight', async () => {
	await render(Basic);
	await openBasic();
	const content = el<HTMLElement>(Content);
	const size = content.getBoundingClientRect().height;

	await swipe(content, 0, size * 0.2, { lift: false });

	await expect.poll(() => offset(content)).toBeCloseTo(0.2, 2);
	expect(content.getAttribute('ui-dragging')).toBe('');
	expect(el(Root).getAttribute('ui-dragging')).toBe('');
	// Still open: nothing has been released yet.
	expect(el(Backdrop).hasAttribute('hidden')).toBe(false);
});

test('CSR: a cancelled swipe puts the drawer back without reporting anything', async () => {
	await render(Basic);
	await openBasic();
	const content = el<HTMLElement>(Content);
	const size = content.getBoundingClientRect().height;

	await swipe(content, 0, size * 0.6, { cancel: true });

	await expect.poll(() => content.hasAttribute('ui-dragging')).toBe(false);
	expect(el(Backdrop).hasAttribute('hidden')).toBe(false);
	await expect.poll(() => offset(content)).toBe(0);
});

// There is no handle part, so the surface's own area is the grab area, and a
// press on anything a consumer put inside it belongs to that thing.
test('CSR: a press on a control inside the drawer never starts a swipe', async () => {
	await render(Basic);
	await openBasic();
	const content = el<HTMLElement>(Content);
	const box = content.getBoundingClientRect();

	pointer(el(Apply), 'pointerdown', box.left + 4, box.top + 4);
	pointer(content, 'pointermove', box.left + 4, box.top + 200);
	await tick();
	pointer(content, 'pointerup', box.left + 4, box.top + 200);

	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(false);
	expect(content.hasAttribute('ui-dragging')).toBe(false);
	expect(offset(content)).toBe(0);
});

test('CSR: a swipe up settles on the next rest position and reports it once', async () => {
	await render(Snapped);
	await openBasic();
	const content = el<HTMLElement>(Content);
	const size = content.getBoundingClientRect().height;
	expect(offset(content)).toBe(0.5);

	// Up is toward open for a bottom sheet, and half a drawer's worth of it lands
	// exactly on the top rest position.
	await swipe(content, 0, -size * 0.5);

	await expect.poll(() => offset(content)).toBe(0);
	await expect.poll(() => el(Snap).textContent).toBe('1');
	expect(el(Calls).textContent).toBe('1');
	expect(el(Backdrop).hasAttribute('hidden')).toBe(false);
});

test('CSR: a swipe down from the lowest rest position closes the drawer', async () => {
	await render(Snapped);
	await openBasic();
	const content = el<HTMLElement>(Content);
	const size = content.getBoundingClientRect().height;

	await swipe(content, 0, size * 0.4);

	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);
	// Closing did not report a rest position; it reported the drawer closing.
	expect(el(Snap).textContent).toBe('');
});

test('CSR: a flick toward open steps one rest position rather than skipping', async () => {
	await render(Snapped);
	await openBasic();
	const content = el<HTMLElement>(Content);
	const size = content.getBoundingClientRect().height;

	// Barely moved, but fast: the step is the flick's, not the travel's.
	await swipe(content, 0, -size * 0.05, { flick: true });

	await expect.poll(() => el(Snap).textContent).toBe('1');
	await expect.poll(() => offset(content)).toBe(0);
});

// ------------------------------------------------------------- the keyboard

test('CSR: the arrow keys along the axis step the rest positions', async () => {
	await render(Snapped);
	await openBasic();
	const content = el<HTMLElement>(Content);
	await expect.poll(() => document.activeElement).toBe(content);

	press(content, 'ArrowUp');
	await expect.poll(() => el(Snap).textContent).toBe('1');
	await expect.poll(() => offset(content)).toBe(0);

	press(content, 'ArrowDown');
	await expect.poll(() => el(Snap).textContent).toBe('0.5');
	await expect.poll(() => offset(content)).toBe(0.5);

	// The walk stops at the end rather than cycling round to the top.
	press(content, 'ArrowDown');
	await expect.poll(() => el(Calls).textContent).toBe('2');
	expect(offset(content)).toBe(0.5);
});

test('CSR: an arrow key off the axis moves nothing', async () => {
	await render(Snapped);
	await openBasic();
	const content = el<HTMLElement>(Content);

	press(content, 'ArrowLeft');
	press(content, 'ArrowRight');
	await tick();

	expect(el(Snap).textContent).toBe('');
	expect(offset(content)).toBe(0.5);
});

test('CSR: a drawer with one rest position ignores the arrows', async () => {
	await render(Basic);
	await openBasic();
	const content = el<HTMLElement>(Content);

	press(content, 'ArrowUp');
	press(content, 'ArrowDown');
	await tick();

	expect(offset(content)).toBe(0);
	expect(el(Backdrop).hasAttribute('hidden')).toBe(false);
});

// ----------------------------------------------------------------- the edges

test('CSR: a start-anchored side panel closes toward the inline-start edge', async () => {
	await render(Panel);
	el(SideTrigger).click();
	await expect.poll(() => el(SideBackdrop).hasAttribute('hidden')).toBe(false);
	const content = el<HTMLElement>(SideContent);
	const size = content.getBoundingClientRect().width;
	expect(size).toBeGreaterThan(100);

	// Leftward is out for this panel, so the same travel the other way does nothing.
	await swipe(content, size * 0.4, 0);
	await expect.poll(() => offset(content)).toBe(0);
	expect(el(SideBackdrop).hasAttribute('hidden')).toBe(false);

	await swipe(content, -size * 0.4, 0);
	await expect.poll(() => el(SideBackdrop).hasAttribute('hidden')).toBe(true);
});

test('CSR: a start-anchored top sheet closes upward', async () => {
	await render(Panel);
	el(TopTrigger).click();
	await expect.poll(() => el(TopBackdrop).hasAttribute('hidden')).toBe(false);
	const content = el<HTMLElement>(TopContent);
	const size = content.getBoundingClientRect().height;

	await swipe(content, 0, -size * 0.4);

	await expect.poll(() => el(TopBackdrop).hasAttribute('hidden')).toBe(true);
});

// ------------------------------------------------------------- the dismissal

test('CSR: a press on the backdrop is not a dismissal until the release lands there too', async () => {
	await render(Basic);
	await openBasic();
	const backdrop = el<HTMLElement>(Backdrop);

	backdrop.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
	await tick();
	expect(backdrop.hasAttribute('hidden')).toBe(false);

	backdrop.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);
});

// The gesture the family exists for is a drag that ends off the surface, so this
// is the case the two-phase guard is actually protecting.
test('CSR: a swipe that starts on the surface and ends on the backdrop is not a dismissal', async () => {
	await render(Basic);
	await openBasic();
	const content = el<HTMLElement>(Content);
	const backdrop = el<HTMLElement>(Backdrop);
	const size = content.getBoundingClientRect().height;

	await swipe(content, 0, size * 0.05, { lift: false });
	backdrop.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));

	await tick();
	expect(backdrop.hasAttribute('hidden')).toBe(false);
});

test('CSR: the page behind an open drawer cannot be reached, and a non-modal one leaves it alone', async () => {
	await render(NonModal);
	el(Trigger).click();
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(false);

	expectBackgroundReachable(el(Background));
	expect(document.body.style.overflow).toBe('');
	el<HTMLElement>(Background).focus();
	expect(document.activeElement).toBe(el(Background));
});

// ------------------------------------------------------------ composition

test('CSR: a drawer inside a drawer is the same parts, and closing the inner one leaves the outer showing', async () => {
	await render(Nested);
	el(OuterTrigger).click();
	await expect.poll(() => el(OuterBackdrop).hasAttribute('hidden')).toBe(false);
	el(InnerTrigger).click();
	await expect.poll(() => el(InnerBackdrop).hasAttribute('hidden')).toBe(false);

	el(InnerClose).click();
	await expect.poll(() => el(InnerBackdrop).hasAttribute('hidden')).toBe(true);
	expect(el(OuterBackdrop).hasAttribute('hidden')).toBe(false);
	// Both marks are counted, so the inner drawer closing cannot un-hide a
	// background the outer one still hides.
	expectBackgroundOutOfReach(el(Background));

	el(OuterClose).click();
	await expect.poll(() => el(OuterBackdrop).hasAttribute('hidden')).toBe(true);
	expectBackgroundReachable(el(Background));
});

test('CSR: two drawers on one page keep their own state', async () => {
	await render(WithOnChange);

	el(FirstTrigger).click();
	await expect.poll(() => el(FirstBackdrop).hasAttribute('hidden')).toBe(false);
	expect(el(SecondBackdrop).hasAttribute('hidden')).toBe(true);

	el(FirstClose).click();
	await expect.poll(() => el(FirstBackdrop).hasAttribute('hidden')).toBe(true);

	el(SecondTrigger).click();
	await expect.poll(() => el(SecondBackdrop).hasAttribute('hidden')).toBe(false);
	expect(el(FirstBackdrop).hasAttribute('hidden')).toBe(true);
	await expect.poll(() => el(SecondValue).textContent).toBe('true');
});

test('CSR: a controlled drawer reports a swipe and moves only when the page hands it back', async () => {
	await render(Controlled);
	el(Opener).click();
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(false);
	const content = el<HTMLElement>(Content);
	const size = content.getBoundingClientRect().height;
	expect(offset(content)).toBe(0.5);

	await swipe(content, 0, -size * 0.5);

	await expect.poll(() => el(Reported).textContent).toBe('1');
	// The page still says 0.5, so the drawer is still half open.
	expect(el(Snap).textContent).toBe('0.5');
	expect(offset(content)).toBe(0.5);

	el(Expander).click();
	await expect.poll(() => offset(content)).toBe(0);
});

// Carried from the modal family: the overlay behaviour enlists an element that
// *becomes* shown and deliberately never enlists one shown at first render. This
// row asserts what actually happens, so the day it changes is visible.
test('SSR: a drawer served open renders drawer markup but never enlists', async () => {
	await renderSSR(ServedOpen);

	expectShowing(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));
	expect(el(Content).getAttribute('role')).toBe('dialog');
	expect(el(Content).getAttribute('aria-modal')).toBe('true');
	expectBackgroundReachable(el(Background));
	expect(document.body.style.overflow).toBe('');
});

// ----------------------------------------------------------------------- axe

for (const mode of MODES) {
	test(`axe finds nothing on the starter in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		await expectNoAxeViolations(scopeOf(mounted), `the starter rests in ${mode}`);
	});

	test(`axe finds nothing on the described drawer in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Described) : await renderSSR(Described);
		await expectNoAxeViolations(scopeOf(mounted), `the described drawer rests in ${mode}`);
	});

	test(`axe finds nothing on the snapped drawer in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Snapped) : await renderSSR(Snapped);
		await expectNoAxeViolations(scopeOf(mounted), `the snapped drawer rests in ${mode}`);
	});

	test(`axe finds nothing on the side panel and top sheet in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Panel) : await renderSSR(Panel);
		await expectNoAxeViolations(scopeOf(mounted), `the other two edges rest in ${mode}`);
	});

	test(`axe finds nothing on the non-modal drawer in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(NonModal) : await renderSSR(NonModal);
		await expectNoAxeViolations(scopeOf(mounted), `the non-modal drawer rests in ${mode}`);
	});

	test(`axe finds nothing on the drawer served open in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(ServedOpen) : await renderSSR(ServedOpen);
		await expectNoAxeViolations(scopeOf(mounted), `the served drawer shows in ${mode}`);
	});
}
