import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import axe from 'axe-core';
import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import {
	channelValue,
	colorOf,
	hexText,
	hsbToHsl,
	hsbToRgb,
	hslToHsb,
	parseColor,
	rgbToHsb,
	withChannel,
} from './colorpicker-math.ts';
import { colorName } from './colorpicker-names.ts';
import Alpha from './scenarios/alpha.tsrx';
import Basic from './scenarios/basic.tsrx';
import Channels from './scenarios/channels.tsrx';
import Controlled from './scenarios/controlled.tsrx';
import Form from './scenarios/form.tsrx';
import Popup from './scenarios/popup.tsrx';
import Swatches from './scenarios/swatches.tsrx';
import TypedEntry from './scenarios/typed-entry.tsrx';

const Root = page.getByTestId('root');
const Label = page.getByTestId('label');
const Content = page.getByTestId('content');
const Area = page.getByTestId('area');
const AreaThumb = page.getByTestId('area-thumb');
const HueTrack = page.getByTestId('hue-track');
const HueThumb = page.getByTestId('hue-thumb');
const AlphaThumb = page.getByTestId('alpha-thumb');
const ValueLabel = page.getByTestId('valuelabel');
const Field = page.getByTestId('field');
const HexInput = page.getByTestId('hex-input');
const RedInput = page.getByTestId('red-input');
const Trigger = page.getByTestId('trigger');
const Changed = page.getByTestId('changed');
const Settled = page.getByTestId('settled');
const Calls = page.getByTestId('calls');

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
const MODES = ['CSR', 'SSR'] as const;

// The same tags the shared conformance battery runs. Contrast is absent on
// purpose rather than by suppression: this family ships unstyled.
const AXE_TAGS = ['wcag2a', 'wcag21a'] as const;

afterEach(async () => {
	await cleanup();
});

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

function axes(): HTMLElement[] {
	return Array.from(el(Area).querySelectorAll<HTMLElement>('[ui-axis]'));
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

/** A point in the plane, given as a share of it: 0,0 is bottom left in colour terms. */
function inArea(shareX: number, shareY: number) {
	const box = el(Area).getBoundingClientRect();
	return { x: box.left + box.width * shareX, y: box.top + box.height * (1 - shareY) };
}

function alongRail(rail: Element, share: number) {
	const box = rail.getBoundingClientRect();
	return { x: box.left + box.width * share, y: box.top + box.height / 2 };
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

// ------------------------------------------------------------------ rendering

function expectBasicRendered() {
	const [x, y] = axes();
	expect(el(Area).getAttribute('role')).toBe('group');
	expect(el(Area).getAttribute('aria-labelledby')).toBe(el(Label).id);
	expect(el(Label).id).toBeTruthy();

	expect(x.getAttribute('role')).toBe('slider');
	expect(x.getAttribute('aria-roledescription')).toBe('2D Slider');
	expect(x.getAttribute('aria-label')).toBe('Saturation');
	expect(x.getAttribute('aria-valuemin')).toBe('0');
	expect(x.getAttribute('aria-valuemax')).toBe('100');
	expect(x.getAttribute('aria-valuenow')).toBe('80');
	expect(x.hasAttribute('aria-orientation')).toBe(false);
	expect(x.getAttribute('tabindex')).toBe('0');

	expect(y.getAttribute('aria-label')).toBe('Brightness');
	expect(y.getAttribute('aria-orientation')).toBe('vertical');
	expect(y.getAttribute('aria-valuenow')).toBe('100');
	// Roving: one tab stop for one visual control, and both axes stay exposed.
	expect(y.getAttribute('tabindex')).toBe('-1');
	expect(y.hasAttribute('aria-hidden')).toBe(false);

	// The full three-channel form is what the first move after focus announces.
	expect(x.getAttribute('aria-valuetext')).toBe(
		'Saturation: 80%, Brightness: 100%, Hue: 210°, vibrant cyan blue',
	);

	const thumb = el(HueThumb);
	expect(thumb.getAttribute('role')).toBe('slider');
	expect(thumb.getAttribute('aria-label')).toBe('Hue');
	expect(thumb.getAttribute('aria-valuemin')).toBe('0');
	// The channel's own range, not a hardcoded 0-100.
	expect(thumb.getAttribute('aria-valuemax')).toBe('360');
	expect(thumb.getAttribute('aria-valuenow')).toBe('210');
	expect(thumb.getAttribute('aria-valuetext')).toBe('Hue: 210°, cyan blue');
	expect(thumb.getAttribute('tabindex')).toBe('0');

	// Inside the area the same part is the marker and carries no value at all.
	expect(el(AreaThumb).getAttribute('role')).toBe('presentation');
	expect(el(AreaThumb).hasAttribute('aria-valuenow')).toBe(false);
	expect(el(AreaThumb).hasAttribute('tabindex')).toBe(false);
	expect(el(AreaThumb).hasAttribute('ui-channel')).toBe(false);

	expect(el(ValueLabel).textContent).toBe('vibrant cyan blue, #3399FF');
	expect(el<HTMLInputElement>(Field).value).toBe('#3399FF');
	expect(el<HTMLInputElement>(Field).getAttribute('name')).toBe('brand');
}

function expectBasicDataSurface() {
	const root = el(Root);
	expect(root.hasAttribute('ui-disabled')).toBe(false);
	expect(root.hasAttribute('ui-alpha')).toBe(false);
	expect(root.hasAttribute('ui-popup')).toBe(false);
	expect(root.hasAttribute('ui-open')).toBe(true);
	expect(customProperty(root, '--colorpicker-value')).toBe('#3399FF');

	// The geometry is published once on the root and inherits to every part, so a
	// stylesheet reads it wherever it paints. The family owns no other element's
	// style than the thumb's, because the consumer has to size the rest.
	expect(customProperty(root, '--colorpicker-hue')).toBe('210');
	expect(customProperty(root, '--colorpicker-pure')).toBe('#0080FF');
	expect(customProperty(el(Area), '--colorpicker-x')).toBe('80%');
	expect(customProperty(el(Area), '--colorpicker-y')).toBe('100%');
	// The positioning default is CSS the family ships, not a style string JS built.
	expect(window.getComputedStyle(el(Area)).position).toBe('relative');
	expect(window.getComputedStyle(el(Area)).touchAction).toBe('none');
	expect(window.getComputedStyle(axes()[0]).position).toBe('absolute');
	expect(window.getComputedStyle(el(AreaThumb)).position).toBe('absolute');
	expect(window.getComputedStyle(el(HueTrack)).position).toBe('relative');
	expect(customProperty(el(AreaThumb), '--colorpicker-x')).toBe('80%');

	expect(el(HueTrack).getAttribute('ui-channel')).toBe('hue');
	expect(el(HueThumb).getAttribute('ui-channel')).toBe('hue');
	expect(customProperty(el(HueThumb), '--colorpicker-offset')).toBe('58.33%');
	expect(el(ValueLabel).getAttribute('ui-value')).toBe('#3399FF');
}

function expectRootDropsDestructuredProps() {
	const root = el(Root);
	expect(root.hasAttribute('value')).toBe(false);
	expect(root.hasAttribute('swatches')).toBe(false);
	expect(root.hasAttribute('alpha')).toBe(false);
	expect(root.hasAttribute('popup')).toBe(false);
	expect(root.hasAttribute('name')).toBe(false);
	// Dropping too much has to show up as red here rather than pass by deleting everything.
	expect(customProperty(root, '--colorpicker-value')).toBe('#3399FF');
}

for (const mode of MODES) {
	test(`${mode}: the starter renders the plane, its two axis controls and the hue rail`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test(`${mode}: the starter publishes its colour and geometry as data`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicDataSurface();
	});

	test(`${mode}: the root drops the props it destructured`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectRootDropsDestructuredProps();
	});

	test(`${mode}: every channel rail reports its own range and value`, async () => {
		if (mode === 'CSR') await render(Channels);
		else await renderSSR(Channels);
		const expected: ReadonlyArray<readonly [string, string, string, string]> = [
			['hue-thumb', 'Hue', '360', '210'],
			['saturation-thumb', 'Saturation', '100', '80'],
			['brightness-thumb', 'Brightness', '100', '100'],
			['lightness-thumb', 'Lightness', '100', '60'],
			['red-thumb', 'Red', '255', '51'],
			['green-thumb', 'Green', '255', '153'],
			['blue-thumb', 'Blue', '255', '255'],
		];
		for (const [testid, named, top, now] of expected) {
			const thumb = el(page.getByTestId(testid));
			expect(thumb.getAttribute('aria-label'), testid).toBe(named);
			expect(thumb.getAttribute('aria-valuemin'), testid).toBe('0');
			expect(thumb.getAttribute('aria-valuemax'), testid).toBe(top);
			expect(thumb.getAttribute('aria-valuenow'), testid).toBe(now);
		}
	});

	test(`${mode}: an alpha picker keeps the channel, shows it and submits it`, async () => {
		if (mode === 'CSR') await render(Alpha);
		else await renderSSR(Alpha);
		expect(el(Root).hasAttribute('ui-alpha')).toBe(true);
		expect(el(AlphaThumb).getAttribute('aria-valuemin')).toBe('0');
		expect(el(AlphaThumb).getAttribute('aria-valuemax')).toBe('1');
		expect(el(AlphaThumb).getAttribute('aria-valuenow')).toBe('0.5');
		// Alpha announces no colour name: repeating one there tells a person nothing new.
		expect(el(AlphaThumb).getAttribute('aria-valuetext')).toBe('Alpha: 50%');
		// The name form changes wholesale below full opacity rather than gaining a number.
		expect(el(ValueLabel).textContent).toContain('50% transparent');
		expect(el<HTMLInputElement>(Field).value).toBe('#3399FF80');
	});

	test(`${mode}: the form element carries the name, the value and the restrictions`, async () => {
		if (mode === 'CSR') await render(Form);
		else await renderSSR(Form);
		const field = el<HTMLInputElement>(Field);
		expect(field.getAttribute('type')).toBe('text');
		expect(field.getAttribute('name')).toBe('brand');
		expect(field.value).toBe('#3399FF');
		expect(field.getAttribute('tabindex')).toBe('-1');
		expect(field.getAttribute('aria-hidden')).toBe('true');
		expect(field.hasAttribute('required')).toBe(true);
		expect(field.getAttribute('aria-invalid')).toBe('true');
		expect(el(Root).hasAttribute('ui-invalid')).toBe(true);
	});

	test(`${mode}: a popup picker starts closed and reports the surface it opens`, async () => {
		if (mode === 'CSR') await render(Popup);
		else await renderSSR(Popup);
		expect(el(Trigger).getAttribute('aria-haspopup')).toBe('dialog');
		expect(el(Trigger).getAttribute('aria-expanded')).toBe('false');
		expect(el(Trigger).getAttribute('aria-controls')).toBe(el(Content).id);
		expect(el(Content).hasAttribute('hidden')).toBe(true);
		expect(el(Root).hasAttribute('ui-closed')).toBe(true);
	});

	test(`${mode}: swatches are buttons naming their colour and reporting which is in force`, async () => {
		if (mode === 'CSR') await render(Swatches);
		else await renderSSR(Swatches);
		const swatches = page.getByTestId('swatch').all();
		expect(swatches.length).toBe(3);
		const first = swatches[0].element();
		expect(first.tagName).toBe('BUTTON');
		expect(first.getAttribute('type')).toBe('button');
		expect(first.getAttribute('aria-label')).toBe('vibrant cyan blue, #3399FF');
		expect(first.getAttribute('aria-pressed')).toBe('true');
		expect(swatches[1].element().getAttribute('aria-pressed')).toBe('false');
		// A button never carries aria-selected; the role does not support it.
		expect(first.hasAttribute('aria-selected')).toBe(false);
	});
}

// ------------------------------------------------------------------- gestures

test('CSR: a drag across the plane moves saturation and brightness together', async () => {
	await render(Controlled);
	const start = inArea(0.8, 1);
	pointer(el(Area), 'pointerdown', start.x, start.y);
	const mid = inArea(0.5, 0.5);
	pointer(el(Area), 'pointermove', mid.x, mid.y);

	await expect.poll(() => axes()[0].getAttribute('aria-valuenow')).toBe('50');
	expect(axes()[1].getAttribute('aria-valuenow')).toBe('50');
	// The hue is untouched by a move in the plane, which is the whole reason the
	// canonical colour is HSB rather than a hex re-read on every gesture.
	expect(el(HueThumb).getAttribute('aria-valuenow')).toBe('210');

	pointer(el(Area), 'pointerup', mid.x, mid.y);
	await expect.poll(() => el(Settled).textContent).toBe('#406080');
	expect(el(Changed).textContent).toBe('#406080');
});

test('CSR: onChange fires through a drag and onChangeEnd only once it settles', async () => {
	await render(Controlled);
	const start = inArea(0.8, 1);
	pointer(el(Area), 'pointerdown', start.x, start.y);
	pointer(el(Area), 'pointermove', inArea(0.6, 0.8).x, inArea(0.6, 0.8).y);
	pointer(el(Area), 'pointermove', inArea(0.4, 0.6).x, inArea(0.4, 0.6).y);

	await expect.poll(() => el(Calls).textContent).toBe('2');
	expect(el(Settled).textContent).toBe('');

	pointer(el(Area), 'pointerup', inArea(0.4, 0.6).x, inArea(0.4, 0.6).y);
	await expect.poll(() => el(Settled).textContent).not.toBe('');
	expect(el(Calls).textContent).toBe('2');
});

test('CSR: a drag along the hue rail moves hue and leaves the plane where it was', async () => {
	await render(Basic);
	const rail = el(HueTrack);
	const at = alongRail(rail, 0.5);
	pointer(rail, 'pointerdown', at.x, at.y);

	await expect.poll(() => el(HueThumb).getAttribute('aria-valuenow')).toBe('180');
	expect(axes()[0].getAttribute('aria-valuenow')).toBe('80');
	expect(axes()[1].getAttribute('aria-valuenow')).toBe('100');
	expect(rail.hasAttribute('ui-dragging')).toBe(true);

	pointer(rail, 'pointerup', at.x, at.y);
	await expect.poll(() => rail.hasAttribute('ui-dragging')).toBe(false);
});

test('CSR: a drag to the grey edge keeps the hue the picker started on', async () => {
	await render(Basic);
	const start = inArea(0.8, 1);
	pointer(el(Area), 'pointerdown', start.x, start.y);
	const grey = inArea(0, 1);
	pointer(el(Area), 'pointermove', grey.x, grey.y);
	pointer(el(Area), 'pointerup', grey.x, grey.y);

	await expect.poll(() => axes()[0].getAttribute('aria-valuenow')).toBe('0');
	expect(el(HueThumb).getAttribute('aria-valuenow')).toBe('210');
	expect(el(ValueLabel).textContent).toBe('white, #FFFFFF');
});

// The area's axis controls read their own value out of a sync computed. A resumed
// page re-derives one only once a dependency has been written, so this first
// gesture - no earlier pointer, no earlier key - is the read that would answer
// undefined and step to NaN.
test('SSR: the first drag after a resume moves from the rendered colour', async () => {
	await renderSSR(Basic);
	const start = inArea(0.8, 1);
	pointer(el(Area), 'pointerdown', start.x, start.y);
	const mid = inArea(0.5, 0.5);
	pointer(el(Area), 'pointermove', mid.x, mid.y);
	pointer(el(Area), 'pointerup', mid.x, mid.y);

	await expect.poll(() => axes()[0].getAttribute('aria-valuenow')).toBe('50');
	expect(axes()[1].getAttribute('aria-valuenow')).toBe('50');
	expect(el(ValueLabel).textContent).toContain('#406080');
});

test('SSR: the first keystroke after a resume steps from the rendered colour', async () => {
	await renderSSR(Basic);
	axes()[0].focus();

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => axes()[0].getAttribute('aria-valuenow')).toBe('79');
});

test('SSR: the first rail keystroke after a resume steps from the rendered colour', async () => {
	await renderSSR(Basic);
	el<HTMLElement>(HueThumb).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(HueThumb).getAttribute('aria-valuenow')).toBe('211');
});

// ------------------------------------------------------------------- keyboard

test('CSR: arrows step the plane one unit on the axis they name', async () => {
	await render(Basic);
	axes()[0].focus();

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => axes()[0].getAttribute('aria-valuenow')).toBe('79');

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => axes()[0].getAttribute('aria-valuenow')).toBe('80');

	// Focus follows the axis the key moved, so both stay reachable from one tab stop.
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => axes()[1].getAttribute('aria-valuenow')).toBe('99');
	expect(document.activeElement).toBe(axes()[1]);
	expect(axes()[1].getAttribute('tabindex')).toBe('0');
	expect(axes()[0].getAttribute('tabindex')).toBe('-1');

	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => axes()[1].getAttribute('aria-valuenow')).toBe('100');
});

test('CSR: a shifted arrow and the page keys move by the channel page step', async () => {
	await render(Basic);
	axes()[0].focus();

	await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}');
	await expect.poll(() => axes()[0].getAttribute('aria-valuenow')).toBe('70');

	await userEvent.keyboard('{PageDown}');
	await expect.poll(() => axes()[1].getAttribute('aria-valuenow')).toBe('90');

	await userEvent.keyboard('{PageUp}');
	await expect.poll(() => axes()[1].getAttribute('aria-valuenow')).toBe('100');
});

// The one deliberate departure from `slider`: a colour plane's corners are
// meaningful and its edges are not, so Home and End are a page step here.
test('CSR: Home and End move the plane by one page step rather than to the ends', async () => {
	await render(Basic);
	axes()[0].focus();

	await userEvent.keyboard('{Home}');
	await expect.poll(() => axes()[0].getAttribute('aria-valuenow')).toBe('70');

	await userEvent.keyboard('{End}');
	await expect.poll(() => axes()[0].getAttribute('aria-valuenow')).toBe('80');
});

test('CSR: a rail thumb arrows by one and reaches its own ends with Home and End', async () => {
	await render(Basic);
	el<HTMLElement>(HueThumb).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(HueThumb).getAttribute('aria-valuenow')).toBe('211');

	await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
	await expect.poll(() => el(HueThumb).getAttribute('aria-valuenow')).toBe('226');

	await userEvent.keyboard('{Home}');
	await expect.poll(() => el(HueThumb).getAttribute('aria-valuenow')).toBe('0');

	await userEvent.keyboard('{End}');
	await expect.poll(() => el(HueThumb).getAttribute('aria-valuenow')).toBe('360');
});

test('CSR: the announcement shortens once a person is clearly mid-adjustment', async () => {
	await render(Basic);
	axes()[0].focus();

	await userEvent.keyboard('{ArrowLeft}');
	await expect
		.poll(() => axes()[0].getAttribute('aria-valuetext'))
		.toBe('Saturation: 79%, vibrant cyan blue');

	// Leaving and coming back restores the full three-channel context.
	el<HTMLElement>(HueThumb).focus();
	axes()[0].focus();
	await expect
		.poll(() => axes()[0].getAttribute('aria-valuetext'))
		.toBe('Saturation: 79%, Brightness: 100%, Hue: 210°, vibrant cyan blue');
});

// ---------------------------------------------------------------- typed entry

test('CSR: a typed hex commits on Enter and is re-read in every part', async () => {
	await render(TypedEntry);
	const box = el<HTMLInputElement>(HexInput);
	expect(box.getAttribute('type')).toBe('text');
	expect(box.getAttribute('aria-label')).toBe('Hex');
	expect(box.value).toBe('#3399FF');

	await userEvent.tripleClick(HexInput);
	await userEvent.keyboard('#ff0000{Enter}');

	await expect.poll(() => el(HueThumb).getAttribute('aria-valuenow')).toBe('0');
	expect(el(ValueLabel).textContent).toBe('vibrant red, #FF0000');
	expect(box.getAttribute('aria-invalid')).toBe('false');
});

// The graph writes attributes and an input's shown text is its `value` property.
// This row is the family's reason to exist in this shape.
test('CSR: a drag re-displays the hex a person had already typed into', async () => {
	await render(TypedEntry);
	const box = el<HTMLInputElement>(HexInput);
	await userEvent.tripleClick(HexInput);
	await userEvent.keyboard('#ff0000{Enter}');
	await expect.poll(() => box.value).toBe('#FF0000');

	const start = inArea(1, 1);
	pointer(el(Area), 'pointerdown', start.x, start.y);
	const mid = inArea(0.5, 0.5);
	pointer(el(Area), 'pointermove', mid.x, mid.y);
	pointer(el(Area), 'pointerup', mid.x, mid.y);

	await expect.poll(() => box.value).toBe('#804040');
});

test('CSR: an entry that will not parse is reported invalid and then reverts', async () => {
	await render(TypedEntry);
	const box = el<HTMLInputElement>(HexInput);
	await userEvent.tripleClick(HexInput);
	await userEvent.keyboard('nonsense');

	await expect.poll(() => box.getAttribute('aria-invalid')).toBe('true');
	// Nothing else moved: a refused entry changes no colour.
	expect(el(HueThumb).getAttribute('aria-valuenow')).toBe('210');

	await userEvent.keyboard('{Enter}');
	await expect.poll(() => box.value).toBe('#3399FF');
	// Polled, not read once: the revert lands on the element and the state the box
	// reports is recomputed from the graph a tick behind it.
	await expect.poll(() => box.getAttribute('aria-invalid')).toBe('false');
});

test('CSR: a channel box takes a number and reports the channel range', async () => {
	await render(TypedEntry);
	const box = el<HTMLInputElement>(RedInput);
	expect(box.getAttribute('type')).toBe('number');
	expect(box.getAttribute('aria-label')).toBe('Red');
	expect(box.getAttribute('min')).toBe('0');
	expect(box.getAttribute('max')).toBe('255');
	expect(box.value).toBe('51');

	await userEvent.tripleClick(RedInput);
	await userEvent.keyboard('200{Enter}');
	await expect.poll(() => el(ValueLabel).getAttribute('ui-value')).toBe('#C899FF');
});

test('SSR: the first typed commit after a resume lands', async () => {
	await renderSSR(TypedEntry);
	await userEvent.tripleClick(HexInput);
	await userEvent.keyboard('#00ff00{Enter}');
	await expect.poll(() => el(ValueLabel).getAttribute('ui-value')).toBe('#00FF00');
});

// -------------------------------------------------------------------- swatches

test('CSR: pressing a swatch takes its colour and moves the pressed state', async () => {
	await render(Swatches);
	const swatches = page.getByTestId('swatch').all();
	await userEvent.click(swatches[1]);

	await expect.poll(() => el(ValueLabel).getAttribute('ui-value')).toBe('#FF3366');
	expect(swatches[1].element().getAttribute('aria-pressed')).toBe('true');
	expect(swatches[0].element().getAttribute('aria-pressed')).toBe('false');
	expect(axes()[0].getAttribute('aria-valuenow')).toBe('80');
});

// ----------------------------------------------------------------------- popup

test('CSR: the trigger opens the surface, Escape closes it and hands focus back', async () => {
	await render(Popup);
	await userEvent.click(Trigger);
	await expect.poll(() => el(Trigger).getAttribute('aria-expanded')).toBe('true');
	expect(el(Content).hasAttribute('hidden')).toBe(false);
	await expect.poll(() => el(Content).contains(document.activeElement)).toBe(true);

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(Trigger).getAttribute('aria-expanded')).toBe('false');
	expect(el(Content).hasAttribute('hidden')).toBe(true);
	await expect.poll(() => document.activeElement).toBe(el(Trigger));
});

test('CSR: a press beyond the open surface closes it', async () => {
	await render(Popup);
	await userEvent.click(Trigger);
	await expect.poll(() => el(Trigger).getAttribute('aria-expanded')).toBe('true');

	document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
	await expect.poll(() => el(Trigger).getAttribute('aria-expanded')).toBe('false');
});

test('CSR: the popup surface holds the same picker the inline shape does', async () => {
	await render(Popup);
	await userEvent.click(Trigger);
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(false);

	axes()[0].focus();
	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => axes()[0].getAttribute('aria-valuenow')).toBe('79');
	expect(el(ValueLabel).getAttribute('ui-value')).toBe('#369AFF');
});

// The popup is placed by CSS anchoring alone, tooltip's shipped idiom: the root
// scopes the name, the trigger declares it, the surface points at it. Nothing here
// measures a box, so a surface served already showing is placed on its first layout.
test('CSR: the popup surface is anchored to its trigger by CSS alone', async () => {
	await render(Popup);
	const anchor = '--ui-colorpicker';
	expect(window.getComputedStyle(el(Root)).getPropertyValue('anchor-scope')).toBe(anchor);
	expect(window.getComputedStyle(el(Trigger)).getPropertyValue('anchor-name')).toBe(anchor);
	expect(window.getComputedStyle(el(Content)).getPropertyValue('position-anchor')).toBe(anchor);
	expect(window.getComputedStyle(el(Content)).position).toBe('absolute');
});

// An inline picker names no anchor and is placed by the page, which is the whole
// difference between the two shapes in CSS.
test('CSR: an inline surface is not anchored and stays in flow', async () => {
	await render(Basic);
	expect(el(Content).hasAttribute('ui-popup')).toBe(false);
	expect(window.getComputedStyle(el(Content)).position).toBe('static');
});

// ------------------------------------------------------------------------- axe

test('CSR: axe finds no wcag2a/wcag21a violation before or after a drag', async () => {
	const scope = scopeOf(await render(Basic));
	await expectNoAxeViolations(scope, 'at rest');

	const start = inArea(0.8, 1);
	pointer(el(Area), 'pointerdown', start.x, start.y);
	const mid = inArea(0.4, 0.4);
	pointer(el(Area), 'pointermove', mid.x, mid.y);
	pointer(el(Area), 'pointerup', mid.x, mid.y);
	await expect.poll(() => axes()[0].getAttribute('aria-valuenow')).toBe('40');

	await expectNoAxeViolations(scope, 'after a drag');
});

test('SSR: axe finds no wcag2a/wcag21a violation before or after a drag', async () => {
	const scope = scopeOf(await renderSSR(Basic));
	await expectNoAxeViolations(scope, 'at rest');

	const start = inArea(0.8, 1);
	pointer(el(Area), 'pointerdown', start.x, start.y);
	const mid = inArea(0.4, 0.4);
	pointer(el(Area), 'pointermove', mid.x, mid.y);
	pointer(el(Area), 'pointerup', mid.x, mid.y);
	await expect.poll(() => axes()[0].getAttribute('aria-valuenow')).toBe('40');

	await expectNoAxeViolations(scope, 'after a drag');
});

test('CSR: axe finds no violation before or after a typed entry', async () => {
	const scope = scopeOf(await render(TypedEntry));
	await expectNoAxeViolations(scope, 'before a typed entry');

	await userEvent.tripleClick(HexInput);
	await userEvent.keyboard('nonsense');
	await expect.poll(() => el<HTMLInputElement>(HexInput).getAttribute('aria-invalid')).toBe('true');
	await expectNoAxeViolations(scope, 'with an entry the box refuses');

	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el<HTMLInputElement>(HexInput).value).toBe('#3399FF');
	await expectNoAxeViolations(scope, 'after a typed entry');
});

test('CSR: axe finds no violation on every other scenario at rest', async () => {
	await expectNoAxeViolations(scopeOf(await render(Alpha)), 'the alpha picker');
	await cleanup();
	await expectNoAxeViolations(scopeOf(await render(Channels)), 'every channel rail');
	await cleanup();
	await expectNoAxeViolations(scopeOf(await render(Swatches)), 'the swatch row');
	await cleanup();
	await expectNoAxeViolations(scopeOf(await render(Form)), 'the form');
});

test('CSR: axe finds no violation on a popup picker closed or open', async () => {
	const scope = scopeOf(await render(Popup));
	await expectNoAxeViolations(scope, 'the popup closed');

	await userEvent.click(Trigger);
	await expect.poll(() => el(Trigger).getAttribute('aria-expanded')).toBe('true');
	await expectNoAxeViolations(scope, 'the popup open');
});

// ------------------------------------------------------------------------ math

// The conversions have no node lane of their own - this package runs `.browser.ts`
// suites and nothing else under src/ - so the round trips are pinned here.
test('the conversions round-trip through every notation the family accepts', async () => {
	const samples = ['#3399ff', '#39f', 'rgb(51, 153, 255)', 'hsl(210, 100%, 60%)', 'hsb(210, 80%, 100%)'];
	for (const written of samples) {
		const held = parseColor(written);
		expect(held, written).not.toBeNull();
		expect(hexText(held!, false), written).toBe('#3399FF');
	}

	// A colour survives a trip out to RGB and HSL and back.
	for (const written of ['#000000', '#ffffff', '#3399ff', '#c0ffee', '#ff8800']) {
		const held = parseColor(written)!;
		expect(hexText(rgbToHsb(hsbToRgb(held), held.a), false), written).toBe(
			written.toUpperCase(),
		);
		expect(hexText(hslToHsb(hsbToHsl(held)), false), written).toBe(written.toUpperCase());
	}

	// Alpha survives the eight-digit form.
	const translucent = parseColor('#3399ff80')!;
	expect(hexText(translucent, true)).toBe('#3399FF80');

	// A refused notation answers null rather than throwing: a `value` may come out
	// of a database.
	for (const refused of ['rebeccapurple', 'oklch(70% 0.1 210)', 'color(display-p3 1 0 0)', '']) {
		expect(parseColor(refused), refused).toBeNull();
	}

	// A channel set through RGB keeps the hue and saturation black would otherwise
	// erase: the angle is undefined there, it is not zero.
	const black = parseColor('hsb(210, 40%, 0%)')!;
	const stillBlack = withChannel(black, 'blue', 0);
	expect(stillBlack.h).toBe(210);
	expect(stillBlack.s).toBe(40);
	expect(channelValue(colorOf('', '#3399ff'), 'lightness')).toBe(60);

	expect(colorName(parseColor('#3399ff')!, false)).toBe('vibrant cyan blue');
	expect(colorName(parseColor('#ffffff')!, false)).toBe('white');
	expect(colorName(parseColor('#000000')!, false)).toBe('black');
	expect(colorName(parseColor('rgba(51, 153, 255, 0.4)')!, true)).toBe(
		'60% transparent vibrant cyan blue',
	);
});
