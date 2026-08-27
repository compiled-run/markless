import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import axe from 'axe-core';
import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import Bounds from './scenarios/bounds.tsrx';
import Controlled from './scenarios/controlled.tsrx';
import Curve from './scenarios/curve.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Form from './scenarios/form.tsrx';

const Root = page.getByTestId('root');
const Label = page.getByTestId('label');
const Description = page.getByTestId('description');
const Area = page.getByTestId('area');
const Indicator = page.getByTestId('indicator');
const ValueLabel = page.getByTestId('valuelabel');
const CurvePath = page.getByTestId('curve-path');
const Calls = page.getByTestId('calls');
const Drags = page.getByTestId('drags');

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

function handles(): HTMLElement[] {
	return Array.from(el(Area).querySelectorAll<HTMLElement>('[ui-handle]'));
}

function fields(): HTMLInputElement[] {
	return Array.from(el(Root).querySelectorAll<HTMLInputElement>('input[type="text"]'));
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

/** A point in the field, given as a share of each axis: 0,0 is the bottom left. */
function inArea(shareX: number, shareY: number) {
	const box = el(Area).getBoundingClientRect();
	return { x: box.left + box.width * shareX, y: box.top + box.height * (1 - shareY) };
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
	const area = el(Area);
	expect(area.getAttribute('role')).toBe('group');
	expect(area.getAttribute('aria-labelledby')).toBe(el(Label).id);
	expect(el(Label).id).toBeTruthy();
	expect(area.getAttribute('aria-describedby')).toContain(el(Description).id);

	const [thumb] = handles();
	expect(thumb.getAttribute('role')).toBe('slider');
	// The wording every 2D control in the census uses; the design under it is not theirs.
	expect(thumb.getAttribute('aria-roledescription')).toBe('2D slider');
	expect(thumb.getAttribute('aria-labelledby')).toBe(el(Label).id);
	expect(thumb.getAttribute('tabindex')).toBe('0');
	expect(thumb.getAttribute('aria-disabled')).toBe('false');
	// x is the axis a handle reports until a key moves it off x.
	expect(thumb.getAttribute('aria-valuemin')).toBe('0');
	expect(thumb.getAttribute('aria-valuemax')).toBe('1');
	expect(thumb.getAttribute('aria-valuenow')).toBe('0.25');
	// Both axes at rest: no reader ever hears one number and not the other.
	expect(thumb.getAttribute('aria-valuetext')).toBe('X 0.25, Y 0.75');

	expect(el(Indicator).getAttribute('aria-hidden')).toBe('true');
	expect(el(Indicator).hasAttribute('role')).toBe(false);

	expect(el(ValueLabel).textContent).toBe('X 0.25, Y 0.75');
	const [field] = fields();
	expect(field.getAttribute('name')).toBe('offset');
	expect(field.value).toBe('0.25,0.75');
	expect(field.getAttribute('aria-hidden')).toBe('true');
	expect(field.getAttribute('tabindex')).toBe('-1');
}

function expectBasicDataSurface() {
	const root = el(Root);
	expect(root.hasAttribute('ui-disabled')).toBe(false);
	expect(root.hasAttribute('ui-dragging')).toBe(false);

	const [thumb] = handles();
	// The geometry is a custom property the handle publishes; the family builds no CSS string of its own.
	expect(customProperty(thumb, '--pad-x')).toBe('25%');
	expect(customProperty(thumb, '--pad-y')).toBe('75%');

	// The positioning defaults are CSS the family ships in `@layer markless`.
	expect(window.getComputedStyle(el(Area)).position).toBe('relative');
	expect(window.getComputedStyle(el(Area)).touchAction).toBe('none');
	expect(window.getComputedStyle(thumb).position).toBe('absolute');
	expect(window.getComputedStyle(el(Indicator)).position).toBe('absolute');
	expect(window.getComputedStyle(el(Indicator)).pointerEvents).toBe('none');
	expect(el(ValueLabel).getAttribute('ui-value')).toBe('X 0.25, Y 0.75');
}

function expectRootDropsDestructuredProps() {
	const root = el(Root);
	expect(root.hasAttribute('value')).toBe(false);
	expect(root.hasAttribute('defaultValue')).toBe(false);
	expect(root.hasAttribute('minX')).toBe(false);
	expect(root.hasAttribute('maxY')).toBe(false);
	expect(root.hasAttribute('step')).toBe(false);
	expect(root.hasAttribute('disabled')).toBe(false);
	// Dropping too much has to show up as red here rather than pass by deleting everything.
	expect(el(Area).getAttribute('role')).toBe('group');
}

for (const mode of MODES) {
	test(`${mode}: the starter renders the field, its handle and the readout`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test(`${mode}: the starter publishes its geometry and its CSS defaults`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicDataSurface();
	});

	test(`${mode}: the root drops the props it destructured`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectRootDropsDestructuredProps();
	});

	test(`${mode}: two control points are two handles and two tab stops`, async () => {
		if (mode === 'CSR') await render(Curve);
		else await renderSSR(Curve);
		const [first, second] = handles();
		expect(handles()).toHaveLength(2);
		expect(first.getAttribute('tabindex')).toBe('0');
		expect(second.getAttribute('tabindex')).toBe('0');
		expect(first.getAttribute('aria-valuetext')).toBe('X 0.25, Y 0.1');
		expect(second.getAttribute('aria-valuetext')).toBe('X 0.75, Y 0.9');
		expect(customProperty(first, '--pad-x')).toBe('25%');
		expect(customProperty(second, '--pad-y')).toBe('90%');
		// The curve is the consumer's own drawing, computed from the same points.
		expect(el(CurvePath).getAttribute('d')).toBe('M 0 100 C 25 90 75 10 100 0');
	});

	test(`${mode}: an axis reports its own range and its own units`, async () => {
		if (mode === 'CSR') await render(Bounds);
		else await renderSSR(Bounds);
		const [thumb] = handles();
		expect(thumb.getAttribute('aria-valuemin')).toBe('0');
		expect(thumb.getAttribute('aria-valuemax')).toBe('180');
		expect(thumb.getAttribute('aria-valuenow')).toBe('90');
		expect(thumb.getAttribute('aria-valuetext')).toBe('X 90, Y 0');
		expect(customProperty(thumb, '--pad-x')).toBe('50%');
		expect(customProperty(thumb, '--pad-y')).toBe('50%');
	});

	test(`${mode}: a disabled pad drops its handle out of the tab order`, async () => {
		if (mode === 'CSR') await render(Disabled);
		else await renderSSR(Disabled);
		const [thumb] = handles();
		expect(el(Root).hasAttribute('ui-disabled')).toBe(true);
		expect(el(Area).hasAttribute('ui-disabled')).toBe(true);
		expect(thumb.getAttribute('tabindex')).toBe('-1');
		expect(thumb.getAttribute('aria-disabled')).toBe('true');
		expect(thumb.hasAttribute('ui-disabled')).toBe(true);
		expect(fields()[0].disabled).toBe(true);
	});

	test(`${mode}: a form sends one value per handle, each under its own name`, async () => {
		if (mode === 'CSR') await render(Form);
		else await renderSSR(Form);
		const sent = fields();
		expect(sent.map((field) => field.getAttribute('name'))).toEqual(['p1', 'p2']);
		expect(sent.map((field) => field.value)).toEqual(['0.25,0.1', '0.75,0.9']);
	});
}

// ------------------------------------------------------------------- keyboard

for (const mode of MODES) {
	test(`${mode}: the arrows move the focused handle one step per axis`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		const [thumb] = handles();
		thumb.focus();

		await userEvent.keyboard('{ArrowRight}');
		await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('0.26');
		// Stepping along the axis already announced shortens what is spoken.
		expect(thumb.getAttribute('aria-valuetext')).toBe('X 0.26');

		await userEvent.keyboard('{ArrowLeft}');
		await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('0.25');

		// Up increases y: screen y runs down, and what a value means runs up.
		await userEvent.keyboard('{ArrowUp}');
		await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('0.76');
		// The axis changed, so both numbers are announced again.
		expect(thumb.getAttribute('aria-valuetext')).toBe('X 0.25, Y 0.76');
		expect(thumb.getAttribute('aria-valuemin')).toBe('0');
		expect(thumb.getAttribute('aria-valuemax')).toBe('1');

		await userEvent.keyboard('{ArrowDown}');
		await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('0.75');
		expect(thumb.getAttribute('aria-valuetext')).toBe('Y 0.75');
		expect(customProperty(thumb, '--pad-y')).toBe('75%');
	});

	test(`${mode}: a shifted arrow takes ten steps`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		const [thumb] = handles();
		thumb.focus();

		await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
		await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('0.35');

		await userEvent.keyboard('{Shift>}{ArrowUp}{/Shift}');
		await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('0.85');
	});

	test(`${mode}: Home and End take the axis the handle is on to that axis's ends`, async () => {
		if (mode === 'CSR') await render(Bounds);
		else await renderSSR(Bounds);
		const [thumb] = handles();
		thumb.focus();

		await userEvent.keyboard('{End}');
		await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('180');
		expect(thumb.getAttribute('aria-valuetext')).toBe('X 180');

		await userEvent.keyboard('{Home}');
		await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('0');

		// One arrow moves the handle onto y, and Home/End follow it there.
		await userEvent.keyboard('{ArrowUp}');
		await expect.poll(() => thumb.getAttribute('aria-valuetext')).toBe('X 0, Y 1');
		await userEvent.keyboard('{End}');
		await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('30');
		expect(thumb.getAttribute('aria-valuemin')).toBe('-30');
		expect(thumb.getAttribute('aria-valuemax')).toBe('30');

		await userEvent.keyboard('{Home}');
		await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('-30');
	});

	test(`${mode}: a handle stops at the ends of both axes`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		const [thumb] = handles();
		thumb.focus();

		await userEvent.keyboard('{End}');
		await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('1');
		await userEvent.keyboard('{ArrowRight}');
		await expect.poll(() => customProperty(thumb, '--pad-x')).toBe('100%');
		expect(thumb.getAttribute('aria-valuenow')).toBe('1');

		await userEvent.keyboard('{ArrowUp}');
		await userEvent.keyboard('{Shift>}{ArrowUp}{/Shift}');
		await userEvent.keyboard('{Shift>}{ArrowUp}{/Shift}');
		await userEvent.keyboard('{Shift>}{ArrowUp}{/Shift}');
		await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('1');
		expect(customProperty(thumb, '--pad-y')).toBe('100%');
	});

	test(`${mode}: each handle moves on its own`, async () => {
		if (mode === 'CSR') await render(Curve);
		else await renderSSR(Curve);
		const [first, second] = handles();

		second.focus();
		await userEvent.keyboard('{ArrowRight}');
		await expect.poll(() => second.getAttribute('aria-valuenow')).toBe('0.76');
		expect(first.getAttribute('aria-valuenow')).toBe('0.25');

		first.focus();
		await userEvent.keyboard('{ArrowUp}');
		await expect.poll(() => first.getAttribute('aria-valuetext')).toBe('X 0.25, Y 0.11');
		expect(second.getAttribute('aria-valuetext')).toBe('X 0.76, Y 0.9');
		expect(el(CurvePath).getAttribute('d')).toBe('M 0 100 C 25 89 76 10 100 0');
	});

	test(`${mode}: a disabled pad refuses the keys`, async () => {
		if (mode === 'CSR') await render(Disabled);
		else await renderSSR(Disabled);
		const [thumb] = handles();
		thumb.focus();

		await userEvent.keyboard('{ArrowRight}');
		await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('0.25');
		expect(fields()[0].value).toBe('0.25,0.75');
	});
}

// -------------------------------------------------------------------- pointer

for (const mode of MODES) {
	test(`${mode}: a press in the field takes the handle there and drags it`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		const area = el(Area);
		const [thumb] = handles();

		const from = inArea(0.5, 0.5);
		pointer(area, 'pointerdown', from.x, from.y);
		await expect.poll(() => thumb.getAttribute('aria-valuetext')).toBe('X 0.5, Y 0.5');
		expect(el(Root).hasAttribute('ui-dragging')).toBe(true);
		expect(area.hasAttribute('ui-dragging')).toBe(true);
		expect(thumb.hasAttribute('ui-active')).toBe(true);
		// The gesture focuses what it moves, so the keys carry on from where the pointer left off.
		expect(document.activeElement).toBe(thumb);

		const to = inArea(0.8, 0.2);
		pointer(area, 'pointermove', to.x, to.y);
		await expect.poll(() => thumb.getAttribute('aria-valuetext')).toBe('X 0.8, Y 0.2');
		expect(customProperty(thumb, '--pad-x')).toBe('80%');

		pointer(area, 'pointerup', to.x, to.y);
		await expect.poll(() => el(Root).hasAttribute('ui-dragging')).toBe(false);
		expect(thumb.hasAttribute('ui-active')).toBe(false);
		expect(fields()[0].value).toBe('0.8,0.2');
	});

	test(`${mode}: a press in a two-handle field moves the nearer handle`, async () => {
		if (mode === 'CSR') await render(Curve);
		else await renderSSR(Curve);
		const area = el(Area);
		const [first, second] = handles();

		const near = inArea(0.8, 0.8);
		pointer(area, 'pointerdown', near.x, near.y);
		await expect.poll(() => second.getAttribute('aria-valuetext')).toBe('X 0.8, Y 0.8');
		expect(first.getAttribute('aria-valuetext')).toBe('X 0.25, Y 0.1');
		expect(second.hasAttribute('ui-active')).toBe(true);
		expect(first.hasAttribute('ui-active')).toBe(false);
		pointer(area, 'pointerup', near.x, near.y);

		const other = inArea(0.2, 0.2);
		pointer(area, 'pointerdown', other.x, other.y);
		await expect.poll(() => first.getAttribute('aria-valuetext')).toBe('X 0.2, Y 0.2');
		expect(second.getAttribute('aria-valuetext')).toBe('X 0.8, Y 0.8');
		pointer(area, 'pointerup', other.x, other.y);
	});

	test(`${mode}: a press on a handle drags that handle`, async () => {
		if (mode === 'CSR') await render(Curve);
		else await renderSSR(Curve);
		const [first, second] = handles();

		const box = first.getBoundingClientRect();
		pointer(first, 'pointerdown', box.left, box.top);
		await expect.poll(() => first.hasAttribute('ui-active')).toBe(true);

		const to = inArea(0.4, 0.6);
		pointer(first, 'pointermove', to.x, to.y);
		await expect.poll(() => first.getAttribute('aria-valuetext')).toBe('X 0.4, Y 0.6');
		expect(second.getAttribute('aria-valuetext')).toBe('X 0.75, Y 0.9');
		pointer(first, 'pointerup', to.x, to.y);
		await expect.poll(() => first.hasAttribute('ui-active')).toBe(false);
	});

	test(`${mode}: a disabled pad refuses the pointer`, async () => {
		if (mode === 'CSR') await render(Disabled);
		else await renderSSR(Disabled);
		const area = el(Area);
		const [thumb] = handles();

		const from = inArea(0.5, 0.5);
		pointer(area, 'pointerdown', from.x, from.y);
		pointer(area, 'pointermove', from.x, from.y);
		pointer(area, 'pointerup', from.x, from.y);
		await expect.poll(() => thumb.getAttribute('aria-valuetext')).toBe('X 0.25, Y 0.75');
		expect(el(Root).hasAttribute('ui-dragging')).toBe(false);
	});
}

// ------------------------------------------------------------------ controlled

for (const mode of MODES) {
	test(`${mode}: a controlled pad moves only once the page writes the points back`, async () => {
		if (mode === 'CSR') await render(Controlled);
		else await renderSSR(Controlled);
		const [thumb] = handles();
		thumb.focus();

		await userEvent.keyboard('{ArrowRight}');
		await expect.poll(() => el(Calls).textContent).toBe('1');
		await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('0.26');

		const area = el(Area);
		const to = inArea(0.6, 0.4);
		pointer(area, 'pointerdown', to.x, to.y);
		await expect.poll(() => el(Drags).textContent).toBe('1');
		await expect.poll(() => thumb.getAttribute('aria-valuetext')).toBe('X 0.6, Y 0.4');
		pointer(area, 'pointerup', to.x, to.y);
		await expect.poll(() => el(Calls).textContent).toBe('2');

		await userEvent.click(page.getByTestId('reset'));
		await expect.poll(() => thumb.getAttribute('aria-valuetext')).toBe('X 0.25, Y 0.75');
	});
}

// ------------------------------------------------------------------------ axe

// One test per scenario per mode: the SSR harness rewrites a literal `renderSSR`
// call site, so the component cannot be handed to it through a loop variable.
for (const mode of MODES) {
	test(`${mode}: basic has no axe violations`, async () => {
		const result = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		await expectNoAxeViolations(scopeOf(result), 'basic rests');
	});

	test(`${mode}: curve has no axe violations`, async () => {
		const result = mode === 'CSR' ? await render(Curve) : await renderSSR(Curve);
		await expectNoAxeViolations(scopeOf(result), 'curve rests');
	});

	test(`${mode}: bounds has no axe violations`, async () => {
		const result = mode === 'CSR' ? await render(Bounds) : await renderSSR(Bounds);
		await expectNoAxeViolations(scopeOf(result), 'bounds rests');
	});

	test(`${mode}: controlled has no axe violations`, async () => {
		const result = mode === 'CSR' ? await render(Controlled) : await renderSSR(Controlled);
		await expectNoAxeViolations(scopeOf(result), 'controlled rests');
	});

	test(`${mode}: disabled has no axe violations`, async () => {
		const result = mode === 'CSR' ? await render(Disabled) : await renderSSR(Disabled);
		await expectNoAxeViolations(scopeOf(result), 'disabled rests');
	});

	test(`${mode}: form has no axe violations`, async () => {
		const result = mode === 'CSR' ? await render(Form) : await renderSSR(Form);
		await expectNoAxeViolations(scopeOf(result), 'form rests');
	});
}

test('axe stays clean with a handle focused and moved', async () => {
	const result = await render(Basic);
	const [thumb] = handles();
	thumb.focus();
	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('0.76');
	await expectNoAxeViolations(scopeOf(result), 'a handle is focused and moved');
});
