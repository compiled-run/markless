import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import CustomRange from './scenarios/custom-range.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Range from './scenarios/range.tsrx';
import Rtl from './scenarios/rtl.tsrx';
import Vertical from './scenarios/vertical.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';

const Root = page.getByTestId('root');
const Label = page.getByTestId('label');
const Track = page.getByTestId('track');
const Thumb = page.getByTestId('thumb');
const ValueLabel = page.getByTestId('valuelabel');
const StartThumb = page.getByTestId('start-thumb');
const EndThumb = page.getByTestId('end-thumb');
const Changed = page.getByTestId('changed');
const Settled = page.getByTestId('settled');
const Last = page.getByTestId('last');
const SettledAt = page.getByTestId('settled-at');
const Calls = page.getByTestId('calls');

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
const MODES = ['CSR', 'SSR'] as const;

afterEach(async () => {
	await cleanup();
});

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

function customProperty(target: Element, name: string) {
	return window.getComputedStyle(target).getPropertyValue(name).trim();
}

function pointer(target: Element, type: string, clientX: number, clientY: number) {
	target.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			button: 0,
			buttons: 1,
			clientX,
			clientY,
			pointerId: 1,
			isPrimary: true,
		}),
	);
}

/** A point on the rail, given as a share of it: 0 is the left edge, 1 the right. */
function alongTrack(share: number) {
	const box = el(Track).getBoundingClientRect();
	return { x: box.left + box.width * share, y: box.top + box.height / 2 };
}

function downTrack(share: number) {
	const at = alongTrack(share);
	pointer(el(Track), 'pointerdown', at.x, at.y);
}

function moveTrack(share: number) {
	const at = alongTrack(share);
	pointer(el(Track), 'pointermove', at.x, at.y);
}

function upTrack(share: number) {
	const at = alongTrack(share);
	pointer(el(Track), 'pointerup', at.x, at.y);
}

function expectBasicRendered() {
	const thumb = el(Thumb);
	expect(thumb.getAttribute('role')).toBe('slider');
	expect(thumb.getAttribute('tabindex')).toBe('0');
	expect(thumb.getAttribute('aria-valuemin')).toBe('0');
	expect(thumb.getAttribute('aria-valuemax')).toBe('100');
	expect(thumb.getAttribute('aria-valuenow')).toBe('40');
	expect(thumb.getAttribute('aria-valuetext')).toBe('40');
	expect(thumb.getAttribute('aria-orientation')).toBe('horizontal');
	expect(thumb.getAttribute('aria-disabled')).toBe('false');
	expect(thumb.getAttribute('aria-labelledby')).toBe(el(Label).id);
	expect(el(Label).id).toBeTruthy();

	// One thumb is the whole control, so nothing wraps it in a group.
	expect(el(Root).hasAttribute('role')).toBe(false);
	expect(el(ValueLabel).textContent?.trim()).toBe('40');
	expect(el(Track).contains(thumb)).toBe(true);
}

function expectBasicDataSurface() {
	const root = el(Root);
	expect(root.getAttribute('ui-orientation')).toBe('horizontal');
	expect(root.getAttribute('ui-min')).toBe('0');
	expect(root.getAttribute('ui-max')).toBe('100');
	expect(root.hasAttribute('ui-disabled')).toBe(false);

	const thumb = el(Thumb);
	expect(thumb.getAttribute('ui-value')).toBe('40');
	expect(el(ValueLabel).getAttribute('ui-value')).toBe('40');
	expect(thumb.hasAttribute('ui-side')).toBe(false);
	expect(thumb.hasAttribute('ui-dragging')).toBe(false);
	expect(el(Track).hasAttribute('ui-dragging')).toBe(false);

	expect(customProperty(root, '--slider-start')).toBe('0%');
	expect(customProperty(root, '--slider-end')).toBe('40%');
	expect(customProperty(thumb, '--slider-offset')).toBe('40%');
}

function expectRootDropsDestructuredProps() {
	const root = el(Root);
	expect(root.hasAttribute('value')).toBe(false);
	expect(root.hasAttribute('min')).toBe(false);
	expect(root.hasAttribute('max')).toBe(false);
	expect(root.hasAttribute('step')).toBe(false);
	expect(root.hasAttribute('orientation')).toBe(false);
	// Dropping too much has to show up as red here rather than pass by deleting everything.
	expect(root.getAttribute('ui-max')).toBe('100');
	expect(el(Thumb).getAttribute('aria-valuenow')).toBe('40');
}

function expectRangeRendered() {
	expect(el(Root).getAttribute('role')).toBe('group');

	const start = el(StartThumb);
	const end = el(EndThumb);
	expect(start.getAttribute('aria-valuenow')).toBe('20');
	expect(end.getAttribute('aria-valuenow')).toBe('80');
	// Each thumb reports the range it can actually reach, not the slider's own ends.
	expect(start.getAttribute('aria-valuemin')).toBe('0');
	expect(start.getAttribute('aria-valuemax')).toBe('80');
	expect(end.getAttribute('aria-valuemin')).toBe('20');
	expect(end.getAttribute('aria-valuemax')).toBe('100');

	expect(start.getAttribute('ui-side')).toBe('start');
	expect(end.getAttribute('ui-side')).toBe('end');
	expect(start.getAttribute('aria-labelledby')).toBe(el(Label).id);
	expect(end.getAttribute('aria-labelledby')).toBe(el(Label).id);
	expect(el(ValueLabel).textContent?.trim()).toBe('20 – 80');

	expect(customProperty(el(Root), '--slider-start')).toBe('20%');
	expect(customProperty(el(Root), '--slider-end')).toBe('80%');
	expect(customProperty(start, '--slider-offset')).toBe('20%');
	expect(customProperty(end, '--slider-offset')).toBe('80%');
}

function expectCustomRangeRendered() {
	const thumb = el(Thumb);
	expect(thumb.getAttribute('aria-valuemin')).toBe('5');
	expect(thumb.getAttribute('aria-valuemax')).toBe('105');
	expect(thumb.getAttribute('aria-valuenow')).toBe('25');
	expect(customProperty(el(Root), '--slider-end')).toBe('20%');
}

function expectVerticalRendered() {
	expect(el(Thumb).getAttribute('aria-orientation')).toBe('vertical');
	expect(el(Root).getAttribute('ui-orientation')).toBe('vertical');
	expect(el(Track).getAttribute('ui-orientation')).toBe('vertical');
}

function expectDisabledRendered() {
	expect(el(Thumb).getAttribute('tabindex')).toBe('-1');
	expect(el(Thumb).getAttribute('aria-disabled')).toBe('true');
	expect(el(Root).hasAttribute('ui-disabled')).toBe(true);
	expect(el(Track).hasAttribute('ui-disabled')).toBe(true);
	expect(el(Thumb).hasAttribute('ui-disabled')).toBe(true);
}

for (const mode of MODES) {
	test(`${mode}: the starter renders a seeded slider across every part`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test(`${mode}: the starter publishes its state and geometry as data`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicDataSurface();
	});

	test(`${mode}: the root drops the props it destructured`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectRootDropsDestructuredProps();
	});

	test(`${mode}: two values render two thumbs that report each other's bounds`, async () => {
		if (mode === 'CSR') await render(Range);
		else await renderSSR(Range);
		expectRangeRendered();
	});

	test(`${mode}: a consumer-owned range reports both ends and its own share`, async () => {
		if (mode === 'CSR') await render(CustomRange);
		else await renderSSR(CustomRange);
		expectCustomRangeRendered();
	});

	test(`${mode}: a vertical slider reports its axis everywhere`, async () => {
		if (mode === 'CSR') await render(Vertical);
		else await renderSSR(Vertical);
		expectVerticalRendered();
	});

	test(`${mode}: a slider nobody may change is out of the tab order`, async () => {
		if (mode === 'CSR') await render(Disabled);
		else await renderSSR(Disabled);
		expectDisabledRendered();
	});
}

test('CSR: an arrow moves the value by one step in either direction', async () => {
	await render(Basic);
	el<HTMLElement>(Thumb).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('41');

	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('42');

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('41');

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('40');
});

test('CSR: the page keys and a shifted arrow move by ten steps', async () => {
	await render(Basic);
	el<HTMLElement>(Thumb).focus();

	await userEvent.keyboard('{PageUp}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('50');

	await userEvent.keyboard('{PageDown}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('40');

	await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('50');
});

test('CSR: Home and End reach the ends and nothing goes past them', async () => {
	await render(Basic);
	el<HTMLElement>(Thumb).focus();

	await userEvent.keyboard('{End}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('100');

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => customProperty(el(Root), '--slider-end')).toBe('100%');
	expect(el(Thumb).getAttribute('aria-valuenow')).toBe('100');

	await userEvent.keyboard('{Home}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('0');

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => customProperty(el(Root), '--slider-end')).toBe('0%');
	expect(el(Thumb).getAttribute('aria-valuenow')).toBe('0');
});

test('CSR: a keystroke lands on a step counted from min', async () => {
	await render(CustomRange);
	el<HTMLElement>(Thumb).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('35');

	await userEvent.keyboard('{Home}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('5');

	await userEvent.keyboard('{End}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('105');
});

test('CSR: a keystroke refreshes the value everywhere it is published', async () => {
	await render(Basic);
	el<HTMLElement>(Thumb).focus();

	await userEvent.keyboard('{PageUp}');
	await expect.poll(() => el(ValueLabel).textContent?.trim()).toBe('50');
	expect(el(Thumb).getAttribute('ui-value')).toBe('50');
	expect(el(Thumb).getAttribute('aria-valuetext')).toBe('50');
	expect(customProperty(el(Root), '--slider-end')).toBe('50%');
	expect(customProperty(el(Thumb), '--slider-offset')).toBe('50%');
});

test('CSR: neither thumb of a two-value slider can pass the other', async () => {
	await render(Range);

	el<HTMLElement>(StartThumb).focus();
	await userEvent.keyboard('{End}');
	await expect.poll(() => el(StartThumb).getAttribute('aria-valuenow')).toBe('80');
	expect(el(EndThumb).getAttribute('aria-valuenow')).toBe('80');

	el<HTMLElement>(EndThumb).focus();
	await userEvent.keyboard('{Home}');
	await expect.poll(() => el(EndThumb).getAttribute('aria-valuenow')).toBe('80');
	expect(el(StartThumb).getAttribute('aria-valuenow')).toBe('80');

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(EndThumb).getAttribute('aria-valuenow')).toBe('81');
	expect(el(StartThumb).getAttribute('aria-valuemax')).toBe('81');
});

test('CSR: a keystroke both changes the value and settles it', async () => {
	await render(WithOnChange);
	el<HTMLElement>(Thumb).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(Changed).textContent).toBe('1');
	expect(el(Settled).textContent).toBe('1');
	expect(el(Last).textContent).toBe('41');
	expect(el(SettledAt).textContent).toBe('41');

	// A key that cannot move the thumb reports nothing at all.
	await userEvent.keyboard('{Home}');
	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => el(Changed).textContent).toBe('2');
	expect(el(Settled).textContent).toBe('2');
});

test('CSR: a drag reports every step and settles exactly once', async () => {
	await render(WithOnChange);

	downTrack(0.5);
	moveTrack(0.6);
	moveTrack(0.7);
	moveTrack(0.8);
	upTrack(0.8);

	await expect.poll(() => el(Settled).textContent).toBe('1');
	expect(Number(el(Changed).textContent)).toBeGreaterThan(2);
	expect(el(Last).textContent).toBe('80');
	expect(el(SettledAt).textContent).toBe('80');
});

test('CSR: a press on the rail moves the value and takes the focus', async () => {
	await render(Basic);

	downTrack(0.25);
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('25');
	expect(document.activeElement).toBe(el(Thumb));
	expect(el(Thumb).hasAttribute('ui-dragging')).toBe(true);
	expect(el(Track).hasAttribute('ui-dragging')).toBe(true);

	upTrack(0.25);
	await expect.poll(() => el(Thumb).hasAttribute('ui-dragging')).toBe(false);
	expect(el(Track).hasAttribute('ui-dragging')).toBe(false);
});

test('CSR: a press between two thumbs moves the nearer one', async () => {
	await render(Range);

	downTrack(0.3);
	await expect.poll(() => el(StartThumb).getAttribute('aria-valuenow')).toBe('30');
	expect(el(EndThumb).getAttribute('aria-valuenow')).toBe('80');
	expect(document.activeElement).toBe(el(StartThumb));
	expect(el(StartThumb).getAttribute('ui-dragging')).toBe('');
	expect(el(EndThumb).hasAttribute('ui-dragging')).toBe(false);
	upTrack(0.3);

	downTrack(0.7);
	await expect.poll(() => el(EndThumb).getAttribute('aria-valuenow')).toBe('70');
	expect(el(StartThumb).getAttribute('aria-valuenow')).toBe('30');
	expect(document.activeElement).toBe(el(EndThumb));
	upTrack(0.7);
});

test('CSR: a drag keeps a thumb on its own side of the other one', async () => {
	await render(Range);

	downTrack(0.2);
	moveTrack(0.95);
	upTrack(0.95);

	await expect.poll(() => el(StartThumb).getAttribute('aria-valuenow')).toBe('80');
	expect(el(EndThumb).getAttribute('aria-valuenow')).toBe('80');
});

test('CSR: a slider nobody may change ignores the pointer and the keyboard', async () => {
	await render(Disabled);

	downTrack(0.9);
	moveTrack(0.9);
	upTrack(0.9);
	el<HTMLElement>(Thumb).focus();
	await userEvent.keyboard('{ArrowRight}');
	await userEvent.keyboard('{End}');

	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('40');
	expect(el(Calls).textContent).toBe('0');
	expect(el(Track).hasAttribute('ui-dragging')).toBe(false);
});

test('CSR: a vertical slider counts up from the bottom of its rail', async () => {
	await render(Vertical);
	el<HTMLElement>(Thumb).focus();

	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('41');

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('40');

	const box = el(Track).getBoundingClientRect();
	pointer(el(Track), 'pointerdown', box.left + box.width / 2, box.top + 1);
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('100');
	pointer(el(Track), 'pointerup', box.left + box.width / 2, box.top + 1);
});

test('CSR: right-to-left text puts the low value at the right edge', async () => {
	await render(Rtl);
	el<HTMLElement>(Thumb).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('39');

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('40');

	// Up and down are not mirrored; only the two flow-relative arrows are.
	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('41');

	downTrack(1);
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('0');
	upTrack(1);

	downTrack(0);
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('100');
	upTrack(0);
});
