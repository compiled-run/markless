import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import axe from 'axe-core';
import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import {
	boundedRect,
	edgeName,
	edgeValue,
	fieldText,
	heldRect,
	isCropKey,
	keyStep,
	movedRect,
	rectText,
	resizedRect,
	sameRect,
	MODIFIER_STEP,
	SHIFT_STEP,
} from './crop-math.ts';
import type { CropRect } from './crop-types.ts';
import Aspect from './scenarios/aspect.tsrx';
import Basic from './scenarios/basic.tsrx';
import Controlled from './scenarios/controlled.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Fixed from './scenarios/fixed.tsrx';
import Form from './scenarios/form.tsrx';
import Picture from './scenarios/image.tsrx';

const Root = page.getByTestId('root');
const Label = page.getByTestId('label');
const Description = page.getByTestId('description');
const ErrorPart = page.getByTestId('error');
const Area = page.getByTestId('area');
const Selection = page.getByTestId('selection');
const Field = page.getByTestId('field');
const Indicator = page.getByTestId('indicator');
const Content = page.getByTestId('content');
const Calls = page.getByTestId('calls');
const Dragged = page.getByTestId('dragged');
const Cut = page.getByTestId('cut');
const TheForm = page.getByTestId('form');
const Submit = page.getByTestId('submit');

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
const MODES = ['CSR', 'SSR'] as const;

// The same tags the shared conformance battery runs. Contrast is absent on
// purpose rather than by suppression: this family ships unstyled.
const AXE_TAGS = ['wcag2a', 'wcag21a'] as const;

/** Every handle the starter mounts, by the edges it owns. */
const HANDLES = [
	'handle-block-start',
	'handle-block-end',
	'handle-inline-start',
	'handle-inline-end',
	'handle-top-start',
	'handle-top-end',
	'handle-bottom-start',
	'handle-bottom-end',
] as const;

const START: CropRect = { x: 40, y: 30, width: 200, height: 150 };

afterEach(async () => {
	await cleanup();
});

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

function handle(name: string): HTMLElement {
	return el(page.getByTestId(name));
}

/** What the field would submit, read back as numbers. */
function shown(): CropRect {
	const parts = el<HTMLInputElement>(Field).value.split(',').map(Number);
	return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

function custom(target: Element, property: string): number {
	return Number.parseFloat((target as HTMLElement).style.getPropertyValue(property));
}

function pointer(target: Element, type: string, x: number, y: number) {
	target.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			cancelable: true,
			button: 0,
			buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
			clientX: x,
			clientY: y,
			pointerType: 'mouse',
			pointerId: 1,
			isPrimary: true,
		}),
	);
}

/**
 * A whole gesture: press on `grabbed`, travel, lift. The moves and the lift go to
 * the area because that is where the family took pointer capture.
 */
function drag(grabbed: Element, deltaX: number, deltaY: number, options: { lift?: boolean } = {}) {
	const area = el(Area);
	const box = grabbed.getBoundingClientRect();
	const fromX = box.left + box.width / 2;
	const fromY = box.top + box.height / 2;
	pointer(grabbed, 'pointerdown', fromX, fromY);
	pointer(area, 'pointermove', fromX + deltaX / 2, fromY + deltaY / 2);
	pointer(area, 'pointermove', fromX + deltaX, fromY + deltaY);
	if (options.lift !== false) pointer(area, 'pointerup', fromX + deltaX, fromY + deltaY);
}

function press(
	target: Element,
	key: string,
	modifiers: { shift?: boolean; ctrl?: boolean; meta?: boolean } = {},
) {
	target.dispatchEvent(
		new KeyboardEvent('keydown', {
			key,
			bubbles: true,
			cancelable: true,
			shiftKey: modifiers.shift === true,
			ctrlKey: modifiers.ctrl === true,
			metaKey: modifiers.meta === true,
		}),
	);
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

// ------------------------------------------------------------------ geometry
// `crop-math.ts` is a pure module and this package runs no node project, so the
// maths is pinned here beside the markup, the way colorpicker's is.

test('the rectangle is the controlled prop, else what a gesture wrote, else the seed', () => {
	const given = { x: 1, y: 1, width: 10, height: 10 };
	const own = { x: 2, y: 2, width: 20, height: 20 };
	const seed = { x: 3, y: 3, width: 30, height: 30 };
	expect(heldRect(given, own, seed, 40, 40)).toEqual(given);
	expect(heldRect(undefined, own, seed, 40, 40)).toEqual(own);
	expect(heldRect(undefined, undefined, seed, 40, 40)).toEqual(seed);
	// Nothing declared at all still has a rectangle: the smallest one allowed.
	expect(heldRect(undefined, undefined, undefined, 40, 25)).toEqual({
		x: 0,
		y: 0,
		width: 40,
		height: 25,
	});
});

test('a move keeps its size and stays inside the area', () => {
	expect(movedRect(START, 30, 20, 400, 300)).toEqual({ x: 70, y: 50, width: 200, height: 150 });
	// Past the far edge it stops with the rectangle flush against it.
	expect(movedRect(START, 1000, 1000, 400, 300)).toEqual({
		x: 200,
		y: 150,
		width: 200,
		height: 150,
	});
	expect(movedRect(START, -1000, -1000, 400, 300)).toEqual({
		x: 0,
		y: 0,
		width: 200,
		height: 150,
	});
	// An unmeasured area bounds nothing but zero.
	expect(movedRect(START, 1000, 1000, 0, 0)).toEqual({
		x: 1040,
		y: 1030,
		width: 200,
		height: 150,
	});
});

test('a resize moves only the edges its handle owns', () => {
	const free = undefined;
	expect(
		resizedRect(START, false, true, false, false, 40, 99, 400, 300, 40, 40, 400, 300, free),
	).toEqual({ x: 40, y: 30, width: 240, height: 150 });
	expect(
		resizedRect(START, true, false, false, false, 20, 0, 400, 300, 40, 40, 400, 300, free),
	).toEqual({ x: 60, y: 30, width: 180, height: 150 });
	expect(
		resizedRect(START, false, false, true, false, 0, 10, 400, 300, 40, 40, 400, 300, free),
	).toEqual({ x: 40, y: 40, width: 200, height: 140 });
	expect(
		resizedRect(START, false, false, false, true, 0, -20, 400, 300, 40, 40, 400, 300, free),
	).toEqual({ x: 40, y: 30, width: 200, height: 130 });
	// A corner takes both axes at once.
	expect(
		resizedRect(START, true, false, true, false, 10, 10, 400, 300, 40, 40, 400, 300, free),
	).toEqual({ x: 50, y: 40, width: 190, height: 140 });
});

test('the smallest and largest sizes are what a resize stops at', () => {
	const free = undefined;
	expect(
		resizedRect(START, false, true, false, false, -1000, 0, 400, 300, 40, 40, 400, 300, free),
	).toEqual({ x: 40, y: 30, width: 40, height: 150 });
	expect(
		resizedRect(START, false, true, false, false, 1000, 0, 400, 300, 40, 40, 120, 300, free),
	).toEqual({ x: 40, y: 30, width: 120, height: 150 });
	// The area caps the size even when the declared maximum does not.
	expect(
		resizedRect(
			{ x: 0, y: 0, width: 100, height: 100 },
			false,
			true,
			false,
			false,
			1000,
			0,
			400,
			300,
			40,
			40,
			undefined,
			undefined,
			free,
		).width,
	).toBe(400);
});

test('a locked ratio drives the other axis from the one the handle owns', () => {
	const rect = { x: 20, y: 20, width: 160, height: 80 };
	// An inline handle: the width is what moved, so the height follows it.
	expect(resizedRect(rect, false, true, false, false, 40, 0, 400, 300, 40, 20, 320, 160, 2)).toEqual(
		{ x: 20, y: 20, width: 200, height: 100 },
	);
	// A block-only handle: the height moved, so the width follows.
	expect(resizedRect(rect, false, false, false, true, 0, 40, 400, 300, 40, 20, 320, 160, 2)).toEqual(
		{ x: 20, y: 20, width: 240, height: 120 },
	);
	// The tighter of the two limits is what the pair stops at.
	expect(
		resizedRect(rect, false, true, false, false, 1000, 0, 400, 300, 40, 20, 320, 160, 2),
	).toEqual({ x: 20, y: 20, width: 320, height: 160 });
});

test('a start-edge resize grows away from the edge that stayed put', () => {
	// The inline-end edge is at 240 before and after; only the start edge moved.
	const landed = resizedRect(START, true, false, false, false, -30, 0, 400, 300, 40, 40, 400, 300, undefined);
	expect(landed.x + landed.width).toBe(START.x + START.width);
	expect(landed.x).toBe(10);
});

test('the modifiers are fixed multipliers over the one step prop', () => {
	expect(keyStep(false, false, 1)).toBe(1);
	expect(keyStep(true, false, 1)).toBe(SHIFT_STEP);
	expect(keyStep(false, true, 1)).toBe(MODIFIER_STEP);
	// The modifier wins over shift, and the step scales both.
	expect(keyStep(true, true, 2)).toBe(2 * MODIFIER_STEP);
	expect(isCropKey('ArrowLeft')).toBe(true);
	expect(isCropKey('Home')).toBe(true);
	expect(isCropKey('Enter')).toBe(false);
});

test('a handle reports the coordinate of the edge it owns', () => {
	expect(edgeValue(START, true, false, false, false)).toBe(40);
	expect(edgeValue(START, false, true, false, false)).toBe(240);
	expect(edgeValue(START, false, false, true, false)).toBe(30);
	expect(edgeValue(START, false, false, false, true)).toBe(180);
	// A corner speaks for its inline edge.
	expect(edgeValue(START, true, false, true, false)).toBe(40);
});

test('every handle has a name of its own', () => {
	expect(edgeName(true, false, false, false)).toBe('Start edge');
	expect(edgeName(false, true, false, false)).toBe('End edge');
	expect(edgeName(false, false, true, false)).toBe('Top edge');
	expect(edgeName(false, false, false, true)).toBe('Bottom edge');
	expect(edgeName(true, false, true, false)).toBe('Top start corner');
	expect(edgeName(false, true, false, true)).toBe('Bottom end corner');
	const names = new Set([
		edgeName(true, false, false, false),
		edgeName(false, true, false, false),
		edgeName(false, false, true, false),
		edgeName(false, false, false, true),
		edgeName(true, false, true, false),
		edgeName(false, true, true, false),
		edgeName(true, false, false, true),
		edgeName(false, true, false, true),
	]);
	expect(names.size).toBe(8);
});

test('the readout and the field say the same rectangle in their own words', () => {
	expect(rectText(START)).toBe('40, 30, 200×150');
	expect(fieldText(START)).toBe('40,30,200,150');
	expect(sameRect(START, { ...START })).toBe(true);
	expect(sameRect(START, { ...START, x: 41 })).toBe(false);
});

test('a rectangle can be cut down to the limits without a gesture', () => {
	expect(boundedRect({ x: -50, y: -50, width: 900, height: 900 }, 400, 300, 40, 40, 400, 300, undefined)).toEqual(
		{ x: 0, y: 0, width: 400, height: 300 },
	);
	expect(boundedRect({ x: 0, y: 0, width: 10, height: 10 }, 400, 300, 40, 40, 400, 300, undefined)).toEqual(
		{ x: 0, y: 0, width: 40, height: 40 },
	);
	expect(boundedRect({ x: 0, y: 0, width: 200, height: 200 }, 400, 300, 40, 20, 320, 160, 2)).toEqual(
		{ x: 0, y: 0, width: 200, height: 100 },
	);
});

// -------------------------------------------------------------------- markup

function expectStarterRendered() {
	expect(el(Root).tagName).toBe('DIV');
	expect(el(Label).textContent).toBe('Crop');
	expect(el(Selection).getAttribute('role')).toBe('group');
	expect(el(Selection).getAttribute('aria-roledescription')).toBe('crop area');
	expect(el(Selection).getAttribute('tabindex')).toBe('0');
	expect(shown()).toEqual(START);
	for (const name of HANDLES) {
		expect(handle(name).getAttribute('role'), name).toBe('slider');
		expect(handle(name).getAttribute('tabindex'), name).toBe('0');
	}
}

for (const mode of MODES) {
	test(`the starter renders in ${mode}`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectStarterRendered();
	});
}

test('the family CSS ships in a layer rather than as inline style strings', async () => {
	await render(Basic);
	const area = el(Area);
	const selection = el(Selection);
	expect(window.getComputedStyle(area).touchAction).toBe('none');
	expect(window.getComputedStyle(area).position).toBe('relative');
	expect(window.getComputedStyle(selection).position).toBe('absolute');
	// The geometry is custom properties the layer reads, never inset arithmetic
	// written into the style attribute.
	expect(custom(selection, '--x')).toBe(40);
	expect(custom(selection, '--y')).toBe(30);
	expect(custom(selection, '--width')).toBe(200);
	expect(custom(selection, '--height')).toBe(150);
	const box = selection.getBoundingClientRect();
	const areaBox = area.getBoundingClientRect();
	expect(Math.round(box.left - areaBox.left)).toBe(40);
	expect(Math.round(box.top - areaBox.top)).toBe(30);
	expect(Math.round(box.width)).toBe(200);
	expect(Math.round(box.height)).toBe(150);
});

test('the eight handles are the eight edge-and-corner combinations, and say which they are', async () => {
	await render(Basic);
	const written = HANDLES.map((name) => {
		const found = handle(name);
		return [
			found.hasAttribute('ui-inline-start'),
			found.hasAttribute('ui-inline-end'),
			found.hasAttribute('ui-block-start'),
			found.hasAttribute('ui-block-end'),
		].join('/');
	});
	expect(new Set(written).size).toBe(8);
	// No enum anywhere on a handle: the identity is four presence attributes.
	for (const name of HANDLES) {
		expect(handle(name).hasAttribute('ui-position'), name).toBe(false);
		expect(handle(name).hasAttribute('data-position'), name).toBe(false);
	}
	expect(handle('handle-inline-end').getAttribute('aria-orientation')).toBe('horizontal');
	expect(handle('handle-block-start').getAttribute('aria-orientation')).toBe('vertical');
	// A corner runs against both axes, so it names neither.
	expect(handle('handle-top-start').hasAttribute('aria-orientation')).toBe(false);
	expect(handle('handle-top-start').getAttribute('aria-valuetext')).toBe('40, 30');
});

test('a handle reports its edge, and the area bounds it once the area is measured', async () => {
	await render(Basic);
	const far = handle('handle-inline-end');
	expect(far.getAttribute('aria-valuenow')).toBe('240');
	// Cold, before anything has reached the widget, the bound is the rectangle's
	// own far edge — a true lower bound on an area nothing has measured yet.
	expect(far.getAttribute('aria-valuemax')).toBe('240');
	el(Selection).focus();
	await expect.poll(() => far.getAttribute('aria-valuemax')).toBe('400');
	expect(handle('handle-block-end').getAttribute('aria-valuemax')).toBe('300');
	expect(far.getAttribute('aria-valuemin')).toBe('0');
});

// ------------------------------------------------------------------- pointer

test('dragging the rectangle moves it and leaves its size alone', async () => {
	await render(Basic);
	drag(el(Selection), 30, 20);
	await expect.poll(() => shown()).toEqual({ x: 70, y: 50, width: 200, height: 150 });
});

test('a drag that runs past the area stops with the rectangle flush against the edge', async () => {
	await render(Basic);
	drag(el(Selection), 1000, 1000);
	await expect.poll(() => shown()).toEqual({ x: 200, y: 150, width: 200, height: 150 });
});

test('every handle resizes the edges it owns and nothing else', async () => {
	const moves: Array<[string, number, number, CropRect]> = [
		['handle-inline-end', 40, 0, { x: 40, y: 30, width: 240, height: 150 }],
		['handle-inline-start', 20, 0, { x: 60, y: 30, width: 180, height: 150 }],
		['handle-block-start', 0, 10, { x: 40, y: 40, width: 200, height: 140 }],
		['handle-block-end', 0, -20, { x: 40, y: 30, width: 200, height: 130 }],
		['handle-top-start', 10, 10, { x: 50, y: 40, width: 190, height: 140 }],
		['handle-top-end', -10, 10, { x: 40, y: 40, width: 190, height: 140 }],
		['handle-bottom-start', 10, -10, { x: 50, y: 30, width: 190, height: 140 }],
		['handle-bottom-end', -10, -10, { x: 40, y: 30, width: 190, height: 140 }],
	];
	for (const [name, deltaX, deltaY, landed] of moves) {
		await render(Basic);
		drag(handle(name), deltaX, deltaY);
		await expect.poll(() => shown()).toEqual(landed);
		await cleanup();
	}
});

test('a press on a handle resizes rather than moving, though it sits inside the rectangle', async () => {
	await render(Basic);
	drag(handle('handle-inline-end'), 40, 40);
	// A move would have carried y with it; a resize on an inline handle cannot.
	await expect.poll(() => shown()).toEqual({ x: 40, y: 30, width: 240, height: 150 });
});

test('a resize stops at the smallest size rather than turning inside out', async () => {
	await render(Basic);
	drag(handle('handle-inline-end'), -1000, 0);
	await expect.poll(() => shown()).toEqual({ x: 40, y: 30, width: 40, height: 150 });
});

test('a locked ratio holds through a pointer resize', async () => {
	await render(Aspect);
	drag(handle('handle-inline-end'), 40, 0);
	await expect.poll(() => shown()).toEqual({ x: 20, y: 20, width: 200, height: 100 });
});

test('the declared maximum is what a locked resize stops at', async () => {
	await render(Aspect);
	drag(handle('handle-bottom-end'), 1000, 1000);
	await expect.poll(() => shown()).toEqual({ x: 20, y: 20, width: 320, height: 160 });
});

test('a cancelled gesture reports nothing and leaves the rectangle where the last move put it', async () => {
	await render(Controlled);
	drag(el(Selection), 30, 20, { lift: false });
	const area = el(Area);
	pointer(area, 'pointercancel', 0, 0);
	expect(Number(el(Calls).textContent)).toBe(0);
	await expect.poll(() => Number(el(Dragged).textContent)).toBeGreaterThan(0);
});

// ------------------------------------------------------------------ keyboard

test('the arrows move the rectangle by one step, ten with shift and fifty with the modifier', async () => {
	await render(Basic);
	const selection = el(Selection);
	press(selection, 'ArrowRight');
	await expect.poll(() => shown().x).toBe(41);
	press(selection, 'ArrowRight', { shift: true });
	await expect.poll(() => shown().x).toBe(51);
	press(selection, 'ArrowRight', { ctrl: true });
	await expect.poll(() => shown().x).toBe(101);
	press(selection, 'ArrowDown', { meta: true });
	await expect.poll(() => shown().y).toBe(80);
	press(selection, 'ArrowUp');
	await expect.poll(() => shown().y).toBe(79);
	press(selection, 'ArrowLeft');
	await expect.poll(() => shown().x).toBe(100);
	// The size never changes on a move, however far it travels.
	await expect.poll(() => shown().width).toBe(200);
	await expect.poll(() => shown().height).toBe(150);
});

test('home and end send the rectangle to the area edges on the axis the last arrow used', async () => {
	await render(Basic);
	const selection = el(Selection);
	// Inline until an arrow says otherwise.
	press(selection, 'End');
	await expect.poll(() => shown()).toEqual({ x: 200, y: 30, width: 200, height: 150 });
	press(selection, 'Home');
	await expect.poll(() => shown().x).toBe(0);
	press(selection, 'ArrowDown');
	press(selection, 'End');
	await expect.poll(() => shown().y).toBe(150);
	press(selection, 'Home');
	await expect.poll(() => shown().y).toBe(0);
});

test('a key the family does not own is left to the page', async () => {
	await render(Basic);
	const selection = el(Selection);
	const before = shown();
	press(selection, 'Enter');
	press(selection, 'a');
	await expect.poll(() => shown()).toEqual(before);
});

test('the arrows on a handle move that handle edge alone', async () => {
	await render(Basic);
	press(handle('handle-inline-end'), 'ArrowRight');
	await expect.poll(() => shown()).toEqual({ x: 40, y: 30, width: 201, height: 150 });
	press(handle('handle-block-start'), 'ArrowUp', { shift: true });
	await expect.poll(() => shown()).toEqual({ x: 40, y: 20, width: 201, height: 160 });
	// An arrow across a handle's own axis is not its business.
	press(handle('handle-inline-end'), 'ArrowDown');
	await expect.poll(() => shown()).toEqual({ x: 40, y: 20, width: 201, height: 160 });
});

test('a corner handle takes both axes from the keyboard', async () => {
	await render(Basic);
	press(handle('handle-bottom-end'), 'ArrowRight', { shift: true });
	press(handle('handle-bottom-end'), 'ArrowDown', { shift: true });
	await expect.poll(() => shown()).toEqual({ x: 40, y: 30, width: 210, height: 160 });
});

test('home and end on a handle send its edge to the area own bounds', async () => {
	await render(Basic);
	const far = handle('handle-inline-end');
	press(far, 'End');
	await expect.poll(() => shown()).toEqual({ x: 40, y: 30, width: 360, height: 150 });
	press(far, 'Home');
	// Home would collapse the rectangle, so the smallest size is what it lands on.
	await expect.poll(() => shown()).toEqual({ x: 40, y: 30, width: 40, height: 150 });
});

test('a key on a handle is not also a move of the whole rectangle', async () => {
	await render(Basic);
	// The press bubbles to the selection, which owns the move keys; the handle's
	// edges are what has to change, and the position must not.
	press(handle('handle-inline-end'), 'ArrowRight');
	await expect.poll(() => shown().x).toBe(40);
	await expect.poll(() => shown().width).toBe(201);
});

test('a locked ratio holds through a keyboard resize', async () => {
	await render(Aspect);
	press(handle('handle-inline-end'), 'ArrowRight', { shift: true });
	await expect.poll(() => shown()).toEqual({ x: 20, y: 20, width: 170, height: 85 });
});

// --------------------------------------------------------------------- state

test('the flags a consumer styles against follow the gesture', async () => {
	await render(Basic);
	const root = el(Root);
	const selection = el(Selection);
	expect(root.hasAttribute('ui-dragging')).toBe(false);
	expect(root.hasAttribute('ui-resizing')).toBe(false);

	drag(selection, 20, 20, { lift: false });
	await expect.poll(() => root.hasAttribute('ui-dragging')).toBe(true);
	expect(root.hasAttribute('ui-resizing')).toBe(false);
	pointer(el(Area), 'pointerup', 0, 0);
	await expect.poll(() => root.hasAttribute('ui-dragging')).toBe(false);

	const far = handle('handle-inline-end');
	drag(far, 20, 0, { lift: false });
	await expect.poll(() => root.hasAttribute('ui-resizing')).toBe(true);
	expect(far.hasAttribute('ui-resizing')).toBe(true);
	// Only the handle in the gesture reports it.
	expect(handle('handle-block-end').hasAttribute('ui-resizing')).toBe(false);
	pointer(el(Area), 'pointerup', 0, 0);
	await expect.poll(() => root.hasAttribute('ui-resizing')).toBe(false);
});

test('a fixed crop keeps the rectangle still and pans the content instead', async () => {
	await render(Fixed);
	const root = el(Root);
	const area = el(Area);
	const selection = el(Selection);
	expect(root.hasAttribute('ui-fixed')).toBe(true);
	expect(custom(el(Root), '--pan-x')).toBe(0);

	drag(selection, 30, 20);
	await expect.poll(() => shown()).toEqual({ x: 30, y: 20, width: 160, height: 120 });
	// The rectangle did not move; the content did, by the same amount the other way.
	await expect.poll(() => custom(selection, '--x')).toBe(0);
	expect(custom(selection, '--y')).toBe(0);
	await expect.poll(() => custom(el(Root), '--pan-x')).toBe(-30);
	expect(custom(el(Root), '--pan-y')).toBe(-20);
	const content = el(Content);
	expect(window.getComputedStyle(content).transform).toContain('matrix');
	expect(Math.round(content.getBoundingClientRect().left - area.getBoundingClientRect().left)).toBe(
		-30,
	);
});

test('a controlled crop moves only once the rectangle is handed back', async () => {
	await render(Controlled);
	const selection = el(Selection);
	drag(selection, 30, 20, { lift: false });
	// Nothing has come back in yet, so nothing has moved.
	await expect.poll(() => shown()).toEqual(START);
	await expect.poll(() => Number(el(Dragged).textContent)).toBeGreaterThan(0);
	expect(Number(el(Calls).textContent)).toBe(0);

	pointer(el(Area), 'pointerup', 0, 0);
	await expect.poll(() => Number(el(Calls).textContent)).toBe(1);
	await expect.poll(() => shown()).toEqual({ x: 70, y: 50, width: 200, height: 150 });

	press(selection, 'ArrowRight', { shift: true });
	await expect.poll(() => shown().x).toBe(80);
	expect(Number(el(Calls).textContent)).toBe(2);
});

test('a controlled crop the page writes back to lands where the page put it', async () => {
	await render(Controlled);
	press(el(Selection), 'ArrowRight', { ctrl: true });
	await expect.poll(() => shown().x).toBe(90);
	el(page.getByTestId('reset')).click();
	await expect.poll(() => shown()).toEqual(START);
});

test('a disabled crop is out of the tab order and takes no gesture at all', async () => {
	await render(Disabled);
	const selection = el(Selection);
	expect(el(Root).hasAttribute('ui-disabled')).toBe(true);
	expect(selection.getAttribute('tabindex')).toBe('-1');
	expect(selection.getAttribute('aria-disabled')).toBe('true');
	expect(handle('handle-inline-end').getAttribute('tabindex')).toBe('-1');

	drag(selection, 30, 20);
	press(selection, 'ArrowRight');
	drag(handle('handle-inline-end'), 40, 0);
	press(handle('handle-inline-end'), 'ArrowRight');
	await expect.poll(() => shown()).toEqual(START);
});

test('the grid is decoration and says nothing', async () => {
	await render(Aspect);
	const grid = el(Indicator);
	expect(grid.getAttribute('aria-hidden')).toBe('true');
	expect(grid.hasAttribute('role')).toBe(false);
	expect(el(Selection).contains(grid)).toBe(true);
	expect(window.getComputedStyle(grid).pointerEvents).toBe('none');
});

// ---------------------------------------------------------------------- form

for (const mode of MODES) {
	test(`the field carries the rectangle a form would send in ${mode}`, async () => {
		if (mode === 'CSR') await render(Form);
		else await renderSSR(Form);
		const field = el<HTMLInputElement>(Field);
		expect(field.name).toBe('crop');
		expect(field.value).toBe('10,20,120,90');
		expect(field.getAttribute('aria-hidden')).toBe('true');
		expect(field.getAttribute('tabindex')).toBe('-1');
		expect(field.required).toBe(true);
		expect(field.getAttribute('aria-invalid')).toBe('true');
		expect(new FormData(el<HTMLFormElement>(TheForm)).get('crop')).toBe('10,20,120,90');
	});
}

test('what the form sends follows the gesture', async () => {
	await render(Form);
	press(el(Selection), 'ArrowRight', { shift: true });
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('20,20,120,90');
	expect(new FormData(el<HTMLFormElement>(TheForm)).get('crop')).toBe('20,20,120,90');
	expect(el(Submit).textContent).toBe('Send');
});

test('the error and the description are what the rectangle is described by, in that order', async () => {
	await render(Form);
	const described = (el(Selection).getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
	expect(described.length).toBe(3);
	expect(document.getElementById(described[0])).toBe(el(ErrorPart));
	expect(document.getElementById(described[1])).toBe(el(Description));
	expect(document.getElementById(described[2])?.tagName).toBe('OUTPUT');
});

test('the live readout says where the rectangle is, and updates when it moves', async () => {
	await render(Basic);
	const live = el(Root).querySelector('output[aria-live]');
	expect(live?.getAttribute('aria-live')).toBe('polite');
	expect(live?.textContent).toBe('40, 30, 200×150');
	press(el(Selection), 'ArrowRight', { ctrl: true });
	await expect.poll(() => live?.textContent).toBe('90, 30, 200×150');
});

// --------------------------------------------------------------------- image

test('the picture recipe turns area pixels into the picture own pixels', async () => {
	await render(Picture);
	const picture = el<HTMLImageElement>(page.getByTestId('picture'));
	await expect.poll(() => picture.naturalWidth).toBe(800);
	drag(el(Selection), 10, 10);
	// Shown at half its natural size, so every number doubles.
	await expect.poll(() => el(Cut).textContent).toBe('100,80,400,300');
	const canvas = el<HTMLCanvasElement>(page.getByTestId('canvas'));
	expect(canvas.width).toBe(400);
	expect(canvas.height).toBe(300);
});

// ----------------------------------------------------------------------- axe

for (const mode of MODES) {
	test(`axe finds nothing on the starter in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		await expectNoAxeViolations(scopeOf(mounted), `the starter rests in ${mode}`);
	});

	test(`axe finds nothing on the locked crop in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Aspect) : await renderSSR(Aspect);
		await expectNoAxeViolations(scopeOf(mounted), `the locked crop rests in ${mode}`);
	});

	test(`axe finds nothing on the fixed crop in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Fixed) : await renderSSR(Fixed);
		await expectNoAxeViolations(scopeOf(mounted), `the fixed crop rests in ${mode}`);
	});

	test(`axe finds nothing on the controlled crop in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Controlled) : await renderSSR(Controlled);
		await expectNoAxeViolations(scopeOf(mounted), `the controlled crop rests in ${mode}`);
	});

	test(`axe finds nothing on the disabled crop in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Disabled) : await renderSSR(Disabled);
		await expectNoAxeViolations(scopeOf(mounted), `the disabled crop rests in ${mode}`);
	});

	test(`axe finds nothing on the form in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Form) : await renderSSR(Form);
		await expectNoAxeViolations(scopeOf(mounted), `the form rests in ${mode}`);
	});

	test(`axe finds nothing on the picture in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Picture) : await renderSSR(Picture);
		await expectNoAxeViolations(scopeOf(mounted), `the picture rests in ${mode}`);
	});
}
