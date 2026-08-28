import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import axe from 'axe-core';
import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { clearDevServerErrorOverlay } from '../../test-support/dev-error-overlay.ts';
import {
	heldPaths,
	joinPaths,
	lastPath,
	outlinePath,
	rasterise,
	strokeCountText,
	strokePath,
	strokeRows,
	svgDocument,
	withoutLast,
	type InkPoint,
} from './ink-stroke.ts';
import Basic from './scenarios/basic.tsrx';
import Buttons from './scenarios/buttons.tsrx';
import Controlled from './scenarios/controlled.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Form from './scenarios/form.tsrx';
import PressureOff from './scenarios/pressure-off.tsrx';
import Readonly from './scenarios/readonly.tsrx';
import Signature from './scenarios/signature.tsrx';

const Root = page.getByTestId('root');
const Label = page.getByTestId('label');
const Description = page.getByTestId('description');
const ErrorPart = page.getByTestId('error');
const Area = page.getByTestId('area');
const Field = page.getByTestId('field');
const Indicator = page.getByTestId('indicator');
const Undo = page.getByTestId('undo');
const Clear = page.getByTestId('clear');
const Count = page.getByTestId('count');
const Calls = page.getByTestId('calls');
const Drawn = page.getByTestId('drawn');
const Submit = page.getByTestId('submit');
const TheForm = page.getByTestId('form');

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
const MODES = ['CSR', 'SSR'] as const;

// The same tags the shared conformance battery runs. Contrast is absent on
// purpose rather than by suppression: this family ships unstyled.
const AXE_TAGS = ['wcag2a', 'wcag21a'] as const;

const KEPT_ONE = 'M 10 10 h 40 v 6 h -40 z';
const KEPT_TWO = 'M 60 20 h 30 v 4 h -30 z';

afterEach(async () => {
	await cleanup();
});

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

function committed(): SVGPathElement[] {
	return Array.from(
		el(Root).querySelectorAll<SVGPathElement>('path[ui-stroke]:not([ui-current])'),
	);
}

function currentPath(): SVGPathElement {
	const found = el(Root).querySelector<SVGPathElement>('path[ui-current]');
	if (!found) throw new Error('Expected the in-flight stroke path.');
	return found;
}

function liveRegion(): Element {
	const found = el(Root).querySelector('output[aria-live]');
	if (!found) throw new Error('Expected the live stroke count.');
	return found;
}

// The mouse is pointer 1 and the platform always holds it; nothing holds this one.
const UNTRACKED_POINTER = 9101;

type StrokeOptions = { pressure?: number; pointerType?: string; pointerId?: number };

function pointer(
	target: Element,
	type: string,
	x: number,
	y: number,
	options: StrokeOptions = {},
) {
	target.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			cancelable: true,
			button: 0,
			buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
			clientX: x,
			clientY: y,
			pressure: options.pressure ?? 0.5,
			pointerType: options.pointerType ?? 'mouse',
			pointerId: options.pointerId ?? 1,
			isPrimary: true,
		}),
	);
}

/** A whole stroke: press, twelve moves along a diagonal, lift. */
function drawStroke(from = 20, options: StrokeOptions = {}) {
	const area = el<SVGSVGElement>(Area);
	const box = area.getBoundingClientRect();
	pointer(area, 'pointerdown', box.left + from, box.top + 20, options);
	for (let step = 1; step <= 12; step++) {
		pointer(area, 'pointermove', box.left + from + step * 8, box.top + 20 + step * 5, options);
	}
	pointer(area, 'pointerup', box.left + from + 96, box.top + 80, options);
}

function press(key: string, modifiers: { meta?: boolean; shift?: boolean; ctrl?: boolean } = {}) {
	el(Area).dispatchEvent(
		new KeyboardEvent('keydown', {
			key,
			bubbles: true,
			cancelable: true,
			metaKey: modifiers.meta === true,
			ctrlKey: modifiers.ctrl === true,
			shiftKey: modifiers.shift === true,
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

function line(count: number, spacing = 8): InkPoint[] {
	const points: InkPoint[] = [];
	for (let step = 0; step < count; step++) {
		points.push({ x: 20 + step * spacing, y: 20 + step * 5, pressure: 0.5 });
	}
	return points;
}

// ------------------------------------------------------------------ geometry
// `ink-stroke.ts` is a pure module and this package runs no node project, so the
// maths is pinned here beside the markup, the way colorpicker's is.

test('the drawing is the controlled prop, else what a gesture wrote, else the seed', () => {
	expect(heldPaths(['a'], ['b'], ['c'])).toEqual(['a']);
	expect(heldPaths(undefined, ['b'], ['c'])).toEqual(['b']);
	expect(heldPaths(undefined, null, ['c'])).toEqual(['c']);
	// An empty controlled array is a real value, not an absent one.
	expect(heldPaths([], ['b'], ['c'])).toEqual([]);
	expect(heldPaths(undefined, [], ['c'])).toEqual([]);
});

test('the submitted value is every stroke joined into one path', () => {
	expect(joinPaths([])).toBe('');
	expect(joinPaths([KEPT_ONE])).toBe(KEPT_ONE);
	expect(joinPaths([KEPT_ONE, KEPT_TWO])).toBe(`${KEPT_ONE} ${KEPT_TWO}`);
});

test('the live count says what a reader cannot see', () => {
	expect(strokeCountText(0)).toBe('Empty');
	expect(strokeCountText(1)).toBe('1 stroke');
	expect(strokeCountText(2)).toBe('2 strokes');
});

test('two byte-identical strokes still key apart', () => {
	const rows = strokeRows([KEPT_ONE, KEPT_ONE]);
	expect(rows.map((row) => row.d)).toEqual([KEPT_ONE, KEPT_ONE]);
	expect(rows[0].id).not.toBe(rows[1].id);
});

test('the newest stroke can be taken off and the rest kept', () => {
	expect(lastPath([KEPT_ONE, KEPT_TWO])).toBe(KEPT_TWO);
	expect(lastPath([])).toBe('');
	expect(withoutLast([KEPT_ONE, KEPT_TWO])).toEqual([KEPT_ONE]);
	expect(withoutLast([])).toEqual([]);
});

test('a stroke is a closed outline, not the raw pointer track', () => {
	const drawn = strokePath(line(12), 8, true, true);
	expect(drawn.startsWith('M')).toBe(true);
	expect(drawn.endsWith('Z')).toBe(true);
	// Every kept point contributes two sides plus the caps, so the outline is
	// always longer than the track it was built from.
	expect(drawn.split(',').length).toBeGreaterThan(12);
});

test('the same samples always build the same path', () => {
	expect(strokePath(line(12), 8, true, true)).toBe(strokePath(line(12), 8, true, true));
});

test('a tap is a dot rather than nothing', () => {
	const dot = strokePath([{ x: 40, y: 40, pressure: 0.5 }], 10, true, true);
	expect(dot.startsWith('M')).toBe(true);
	expect(dot.length).toBeGreaterThan(20);
});

test('no samples is no path at all', () => {
	expect(strokePath([], 8, true, true)).toBe('');
	expect(outlinePath([])).toBe('');
	// Three points cannot make a quadratic run, so they are refused rather than
	// half-drawn.
	expect(
		outlinePath([
			[0, 0],
			[1, 1],
			[2, 2],
		]),
	).toBe('');
});

test('pressure off is a different outline from pressure on', () => {
	const withPressure = strokePath(line(12), 8, true, true);
	const flat = strokePath(line(12), 8, false, true);
	expect(flat).not.toBe(withPressure);
	expect(flat.startsWith('M')).toBe(true);
});

test('a faster stroke is not the same outline as a slow one when pressure is simulated', () => {
	// Simulated pressure is velocity: the same shape drawn with samples further
	// apart is a faster hand, and cannot come out identical.
	const slow = strokePath(line(12, 2), 16, true, true);
	const fast = strokePath(line(12, 40), 16, true, true);
	expect(fast).not.toBe(slow);
});

test('the standalone document carries the drawing at the area own size', () => {
	const markup = svgDocument([KEPT_ONE], 300, 150, 'rgb(17, 17, 17)');
	expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
	expect(markup).toContain('viewBox="0 0 300 150"');
	expect(markup).toContain(`d="${KEPT_ONE}"`);
	expect(markup).toContain('fill="rgb(17, 17, 17)"');
	// An empty stroke would be an empty `d`, which some renderers warn on.
	expect(svgDocument(['', KEPT_ONE], 10, 10, '#000')).not.toContain('d=""');
	// A zero-sized area still produces a document a canvas can take.
	expect(svgDocument([], 0, 0, '#000')).toContain('width="1"');
});

test('the drawing rasterises through a canvas to a data URL', async () => {
	const url = await rasterise(
		svgDocument([KEPT_ONE], 40, 40, '#000'),
		40,
		40,
		'image/png',
		undefined,
	);
	expect(url.startsWith('data:image/png;base64,')).toBe(true);
	expect(url.length).toBeGreaterThan(100);
});

// ------------------------------------------------------------------ rendering

function expectBasicRendered() {
	const area = el<SVGSVGElement>(Area);
	expect(area.namespaceURI).toBe('http://www.w3.org/2000/svg');
	expect(area.getAttribute('role')).toBe('img');
	expect(area.getAttribute('tabindex')).toBe('0');
	expect(area.getAttribute('aria-labelledby')).toBe(el(Label).id);
	expect(el(Label).id).toBeTruthy();

	// Description, then the live count. The error part is not mounted here, so its
	// slot resolves away rather than pointing at nothing.
	const described = (area.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
	expect(described).toContain(el(Description).id);
	expect(described).toContain(liveRegion().id);
	expect(described[described.length - 1]).toBe(liveRegion().id);

	// Empty until something is drawn.
	expect(el(Root).hasAttribute('ui-empty')).toBe(true);
	expect(el(Root).hasAttribute('ui-drawing')).toBe(false);
	expect(liveRegion().textContent).toBe('Empty');
	expect(committed()).toHaveLength(0);
	expect(currentPath().getAttribute('d')).toBe('');

	// The field submits, and nothing but the family touches it.
	const field = el<HTMLInputElement>(Field);
	expect(field.getAttribute('name')).toBe('drawing');
	expect(field.getAttribute('tabindex')).toBe('-1');
	expect(field.getAttribute('aria-hidden')).toBe('true');
	expect(field.value).toBe('');
}

for (const mode of MODES) {
	test(`the starter renders in ${mode}`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});
}

test('the family CSS ships in a layer rather than as inline style strings', async () => {
	await render(Basic);
	const area = el<SVGSVGElement>(Area);
	expect(window.getComputedStyle(area).touchAction).toBe('none');
	// The family writes no style attribute of its own: the scenario's is the only
	// one on the element.
	expect(area.getAttribute('style')).toBe(
		'display: block; width: 300px; height: 150px; color: #111',
	);
	// The in-flight path is hidden while nothing is being drawn.
	expect(window.getComputedStyle(currentPath()).display).toBe('none');
});

test('the guide line is decoration and says nothing', async () => {
	await render(Signature);
	const guide = el<SVGLineElement>(Indicator);
	expect(guide.namespaceURI).toBe('http://www.w3.org/2000/svg');
	expect(guide.getAttribute('aria-hidden')).toBe('true');
	expect(guide.getAttribute('y1')).toBe('75%');
	expect(guide.getAttribute('x2')).toBe('100%');
	expect(el(Area).contains(guide)).toBe(true);
});

// ------------------------------------------------------------------- drawing

test('a stroke lands as one path and reaches the field', async () => {
	await render(Basic);
	drawStroke();

	await expect.poll(() => committed().length).toBe(1);
	const drawn = committed()[0].getAttribute('d') ?? '';
	expect(drawn.startsWith('M')).toBe(true);
	expect(drawn.endsWith('Z')).toBe(true);
	expect(el<HTMLInputElement>(Field).value).toBe(drawn);
	expect(el(Root).hasAttribute('ui-empty')).toBe(false);
	expect(liveRegion().textContent).toBe('1 stroke');
});

test('the stroke in flight is drawn before it is committed', async () => {
	await render(Basic);
	const area = el<SVGSVGElement>(Area);
	const box = area.getBoundingClientRect();
	pointer(area, 'pointerdown', box.left + 20, box.top + 20);
	pointer(area, 'pointermove', box.left + 60, box.top + 60);

	await expect.poll(() => currentPath().getAttribute('d') ?? '').not.toBe('');
	expect(el(Root).hasAttribute('ui-drawing')).toBe(true);
	expect(el(Area).hasAttribute('ui-drawing')).toBe(true);
	expect(window.getComputedStyle(currentPath()).display).not.toBe('none');
	// Nothing is committed until the pointer lifts.
	expect(committed()).toHaveLength(0);

	pointer(area, 'pointerup', box.left + 60, box.top + 60);
	await expect.poll(() => committed().length).toBe(1);
	expect(currentPath().getAttribute('d')).toBe('');
	expect(el(Root).hasAttribute('ui-drawing')).toBe(false);
});

// A press can reach the family with its pointer already lifted - the runtime
// replays a recorded press once its handler has loaded - and capturing a pointer
// the platform is no longer tracking throws.
test('a press from a pointer the platform is not tracking throws nothing', async () => {
	await render(Basic);

	const failures: string[] = [];
	const record = (event: ErrorEvent) => failures.push(event.message);
	const recordRejection = (event: PromiseRejectionEvent) => failures.push(String(event.reason));
	window.addEventListener('error', record);
	window.addEventListener('unhandledrejection', recordRejection);
	try {
		drawStroke(20, { pointerId: UNTRACKED_POINTER });
		await expect.poll(() => committed().length).toBe(1);
		expect(failures).toEqual([]);

		// And the next ordinary stroke still lands.
		drawStroke(140);
		await expect.poll(() => committed().length).toBe(2);
		expect(liveRegion().textContent).toBe('2 strokes');
		expect(failures).toEqual([]);
	} finally {
		window.removeEventListener('error', record);
		window.removeEventListener('unhandledrejection', recordRejection);
	}
});

test('two strokes are two paths and one joined value', async () => {
	await render(Basic);
	drawStroke(20);
	drawStroke(140);

	await expect.poll(() => committed().length).toBe(2);
	const both = committed().map((path) => path.getAttribute('d') ?? '');
	expect(el<HTMLInputElement>(Field).value).toBe(both.join(' '));
	expect(liveRegion().textContent).toBe('2 strokes');
});

test('a press with no movement still leaves a dot', async () => {
	await render(Basic);
	const area = el<SVGSVGElement>(Area);
	const box = area.getBoundingClientRect();
	pointer(area, 'pointerdown', box.left + 40, box.top + 40);
	pointer(area, 'pointerup', box.left + 40, box.top + 40);

	await expect.poll(() => committed().length).toBe(1);
	expect((committed()[0].getAttribute('d') ?? '').length).toBeGreaterThan(20);
});

test('a pen own pressure is used rather than one simulated from speed', async () => {
	await render(Basic);
	drawStroke(20, { pointerType: 'pen', pressure: 0.95 });
	await expect.poll(() => committed().length).toBe(1);
	const heavy = committed()[0].getAttribute('d') ?? '';

	await cleanup();
	await render(Basic);
	drawStroke(20, { pointerType: 'pen', pressure: 0.15 });
	await expect.poll(() => committed().length).toBe(1);
	const light = committed()[0].getAttribute('d') ?? '';

	expect(light).not.toBe(heavy);
});

test('a cancelled pointer drops the stroke instead of committing it', async () => {
	await render(Basic);
	const area = el<SVGSVGElement>(Area);
	const box = area.getBoundingClientRect();
	pointer(area, 'pointerdown', box.left + 20, box.top + 20);
	pointer(area, 'pointermove', box.left + 60, box.top + 60);
	await expect.poll(() => currentPath().getAttribute('d') ?? '').not.toBe('');

	pointer(area, 'pointercancel', box.left + 60, box.top + 60);
	await expect.poll(() => el(Root).hasAttribute('ui-drawing')).toBe(false);
	expect(committed()).toHaveLength(0);
	expect(currentPath().getAttribute('d')).toBe('');
});

test('a stroke keeps arriving after the pointer leaves the area', async () => {
	await render(Basic);
	const area = el<SVGSVGElement>(Area);
	const box = area.getBoundingClientRect();
	pointer(area, 'pointerdown', box.left + 20, box.top + 20);
	// Pointer capture is why these still land on the area at all.
	pointer(area, 'pointermove', box.right + 200, box.bottom + 200);
	pointer(area, 'pointerup', box.right + 200, box.bottom + 200);

	await expect.poll(() => committed().length).toBe(1);
});

// ------------------------------------------------------------------ keyboard

test('the keys on the surface are the drawing edit history', async () => {
	await render(Basic);
	drawStroke(20);
	drawStroke(140);
	await expect.poll(() => committed().length).toBe(2);
	const second = committed()[1].getAttribute('d') ?? '';

	press('z', { meta: true });
	await expect.poll(() => committed().length).toBe(1);
	expect(liveRegion().textContent).toBe('1 stroke');

	press('z', { meta: true, shift: true });
	await expect.poll(() => committed().length).toBe(2);
	expect(committed()[1].getAttribute('d')).toBe(second);

	// Ctrl+Y is the other spelling of redo, so undo first to give it something.
	press('z', { ctrl: true });
	await expect.poll(() => committed().length).toBe(1);
	press('y', { ctrl: true });
	await expect.poll(() => committed().length).toBe(2);
});

test('a new stroke ends the redo chain', async () => {
	await render(Basic);
	drawStroke(20);
	await expect.poll(() => committed().length).toBe(1);
	press('z', { meta: true });
	await expect.poll(() => committed().length).toBe(0);

	drawStroke(140);
	await expect.poll(() => committed().length).toBe(1);
	press('z', { meta: true, shift: true });
	// Nothing to put back: the undone stroke was dropped when a new one landed.
	await expect.poll(() => committed().length).toBe(1);
});

test('Escape drops the stroke being drawn', async () => {
	await render(Basic);
	const area = el<SVGSVGElement>(Area);
	const box = area.getBoundingClientRect();
	pointer(area, 'pointerdown', box.left + 20, box.top + 20);
	pointer(area, 'pointermove', box.left + 60, box.top + 60);
	await expect.poll(() => el(Root).hasAttribute('ui-drawing')).toBe(true);

	press('Escape');
	await expect.poll(() => el(Root).hasAttribute('ui-drawing')).toBe(false);
	expect(committed()).toHaveLength(0);
});

test('the undo keys cancel the browser default so nothing else claims them', async () => {
	await render(Basic);
	const event = new KeyboardEvent('keydown', {
		key: 'z',
		metaKey: true,
		bubbles: true,
		cancelable: true,
	});
	el(Area).dispatchEvent(event);
	expect(event.defaultPrevented).toBe(true);

	const plain = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
	el(Area).dispatchEvent(plain);
	expect(plain.defaultPrevented).toBe(false);
});

// ------------------------------------------------------------------- buttons

test('a consumer own buttons drive the drawing through the cell', async () => {
	await render(Buttons);
	drawStroke(20);
	drawStroke(140);
	await expect.poll(() => committed().length).toBe(2);

	el<HTMLButtonElement>(Clear).click();
	await expect.poll(() => committed().length).toBe(0);
	expect(el(Root).hasAttribute('ui-empty')).toBe(true);
	expect(el<HTMLInputElement>(Field).value).toBe('');
	drawStroke(20);
	drawStroke(140);
	await expect.poll(() => committed().length).toBe(2);
	el<HTMLButtonElement>(Undo).click();
	await expect.poll(() => committed().length).toBe(1);
});

// ---------------------------------------------------------------- controlled

test('a controlled drawing shows nothing until the strokes are handed back', async () => {
	await render(Controlled);
	drawStroke(20);

	await expect.poll(() => el(Calls).textContent).toBe('1');
	// The round trip is what put it on the page: the family drew nothing of its own.
	await expect.poll(() => committed().length).toBe(1);
	expect(el(Count).textContent).toBe('1');

	el<HTMLButtonElement>(Undo).click();
	await expect.poll(() => committed().length).toBe(0);
	drawStroke(140);
	await expect.poll(() => committed().length).toBe(1);
	el<HTMLButtonElement>(Clear).click();
	await expect.poll(() => el(Count).textContent).toBe('0');
	expect(committed()).toHaveLength(0);
});

test('onDraw reports the stroke while it is still being drawn', async () => {
	await render(Controlled);
	const area = el<SVGSVGElement>(Area);
	const box = area.getBoundingClientRect();
	pointer(area, 'pointerdown', box.left + 20, box.top + 20);
	pointer(area, 'pointermove', box.left + 60, box.top + 60);

	await expect.poll(() => el(Drawn).textContent ?? '').not.toBe('');
	// Still nothing committed, and onChange has not fired.
	expect(el(Calls).textContent).toBe('0');
	pointer(area, 'pointerup', box.left + 60, box.top + 60);
	await expect.poll(() => el(Calls).textContent).toBe('1');
});

// ------------------------------------------------------- disabled / readonly

test('a disabled drawing takes no stroke and is out of the tab order', async () => {
	await render(Disabled);
	expect(el(Root).hasAttribute('ui-disabled')).toBe(true);
	expect(el(Area).getAttribute('tabindex')).toBe('-1');
	expect(el<HTMLInputElement>(Field).disabled).toBe(true);

	drawStroke();
	await expect.poll(() => el(Root).hasAttribute('ui-drawing')).toBe(false);
	expect(committed()).toHaveLength(0);

	press('z', { meta: true });
	expect(committed()).toHaveLength(0);
});

test('a readonly drawing is shown, submitted, and cannot be changed', async () => {
	await render(Readonly);
	expect(el(Root).hasAttribute('ui-readonly')).toBe(true);
	await expect.poll(() => committed().length).toBe(1);
	expect(el<HTMLInputElement>(Field).value).toBe(KEPT_ONE);
	// Still reachable: reading a drawing is not editing it.
	expect(el(Area).getAttribute('tabindex')).toBe('0');

	drawStroke();
	await expect.poll(() => committed().length).toBe(1);
	press('z', { meta: true });
	await expect.poll(() => committed().length).toBe(1);
});

// ------------------------------------------------------------------ the form

test('the field carries every stroke joined, under the name the root was given', async () => {
	await render(Form);
	const field = el<HTMLInputElement>(Field);
	expect(field.value).toBe(`${KEPT_ONE} ${KEPT_TWO}`);
	expect(field.getAttribute('name')).toBe('drawing');

	const data = new FormData(el<HTMLFormElement>(TheForm));
	expect(data.get('drawing')).toBe(`${KEPT_ONE} ${KEPT_TWO}`);
});

test('mounting the error part is what marks the drawing invalid', async () => {
	await render(Form);
	expect(el<HTMLInputElement>(Field).getAttribute('aria-invalid')).toBe('true');
	const described = (el(Area).getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
	// What is wrong is conveyed before the hint.
	expect(described[0]).toBe(el(ErrorPart).id);
	expect(described).toContain(el(Description).id);
});

test('an empty required drawing stops the form from submitting', async () => {
	await render(Signature);
	const field = el<HTMLInputElement>(Field);
	expect(field.required).toBe(true);
	expect(field.value).toBe('');
	expect(el<HTMLFormElement>(TheForm).checkValidity()).toBe(false);

	drawStroke();
	await expect.poll(() => committed().length).toBe(1);
	expect(field.value).not.toBe('');
	expect(field.checkValidity()).toBe(true);
	expect(el<HTMLButtonElement>(Submit).type).toBe('submit');
	// The typed name is the other half of the pair and is still empty, so the form
	// is still incomplete: the text alternative is not optional.
	expect(el<HTMLFormElement>(TheForm).checkValidity()).toBe(false);
});

test('pressure off draws one width the whole way', async () => {
	await render(PressureOff);
	drawStroke();
	await expect.poll(() => committed().length).toBe(1);
	const flat = committed()[0].getAttribute('d') ?? '';
	expect(flat.startsWith('M')).toBe(true);
	// The same samples through the family's default settings are a different outline.
	expect(flat).not.toBe(strokePath(line(13), 6, true, true));
});

// -------------------------------------------------------------- accessibility

for (const mode of MODES) {
	test(`axe finds nothing on the starter in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		await expectNoAxeViolations(scopeOf(mounted), `the starter rests in ${mode}`);
	});

	test(`axe finds nothing on the signature pad in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Signature) : await renderSSR(Signature);
		await expectNoAxeViolations(scopeOf(mounted), `the signature pad rests in ${mode}`);
	});

	test(`axe finds nothing on the form in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Form) : await renderSSR(Form);
		await expectNoAxeViolations(scopeOf(mounted), `the form rests in ${mode}`);
	});

	test(`axe finds nothing on the controlled drawing in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Controlled) : await renderSSR(Controlled);
		await expectNoAxeViolations(scopeOf(mounted), `the controlled drawing rests in ${mode}`);
	});

	test(`axe finds nothing on the buttons in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Buttons) : await renderSSR(Buttons);
		await expectNoAxeViolations(scopeOf(mounted), `the buttons rest in ${mode}`);
	});

	test(`axe finds nothing on a disabled drawing in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Disabled) : await renderSSR(Disabled);
		await expectNoAxeViolations(scopeOf(mounted), `disabled in ${mode}`);
	});

	test(`axe finds nothing on a readonly drawing in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Readonly) : await renderSSR(Readonly);
		await expectNoAxeViolations(scopeOf(mounted), `readonly in ${mode}`);
	});

	test(`axe finds nothing with pressure off in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(PressureOff) : await renderSSR(PressureOff);
		await expectNoAxeViolations(scopeOf(mounted), `pressure off in ${mode}`);
	});
}

test('axe finds nothing while a stroke is in flight', async () => {
	const mounted = await render(Basic);
	const area = el<SVGSVGElement>(Area);
	const box = area.getBoundingClientRect();
	pointer(area, 'pointerdown', box.left + 20, box.top + 20);
	pointer(area, 'pointermove', box.left + 60, box.top + 60);
	await expect.poll(() => el(Root).hasAttribute('ui-drawing')).toBe(true);
	await expectNoAxeViolations(scopeOf(mounted), 'a stroke is in flight');
});

test('axe finds nothing after a stroke has landed', async () => {
	const mounted = await render(Basic);
	drawStroke();
	await expect.poll(() => committed().length).toBe(1);
	await expectNoAxeViolations(scopeOf(mounted), 'a stroke has landed');
});

// ------------------------------------------------------------------------ SSR

test('a drawing served whole takes a stroke once the page resumes', async () => {
	await renderSSR(Basic);
	expect(el(Root).hasAttribute('ui-empty')).toBe(true);

	// A real press and release is one dot, and it is also what fetches the pointer
	// handlers: events dispatched straight at the element do not wake a served page.
	await userEvent.click(Area);
	await expect.poll(() => committed().length).toBe(1);

	drawStroke(60);
	await expect.poll(() => committed().length).toBe(2);
	const both = committed().map((path) => path.getAttribute('d') ?? '');
	expect(el<HTMLInputElement>(Field).value).toBe(both.join(' '));
	expect(liveRegion().textContent).toBe('2 strokes');
});

test('a drawing served whole is edited from the keyboard once the page resumes', async () => {
	await renderSSR(Form);
	expect(committed()).toHaveLength(2);
	el<SVGSVGElement>(Area).focus();

	await userEvent.keyboard('{Meta>}z{/Meta}');
	await expect.poll(() => committed().length).toBe(1);
	expect(el<HTMLInputElement>(Field).value).toBe(KEPT_ONE);
});

test('a drawing served with strokes carries them in the served markup', async () => {
	await renderSSR(Form);
	expect(committed().map((path) => path.getAttribute('d'))).toEqual([KEPT_ONE, KEPT_TWO]);
	expect(el<HTMLInputElement>(Field).value).toBe(`${KEPT_ONE} ${KEPT_TWO}`);
	expect(liveRegion().textContent).toBe('2 strokes');
});

// A shared() method called from a handler in another module is text-spliced without
// the family's imports or graph wiring, so the compiler refuses it at build time.
// This row pins the refusal: the quarantined scenario cannot even load. It becomes
// the shape the note recommends once the compiler can carry the definition context.
// The diagnostic text itself is pinned in
// packages/compiler/test/cross-module-shared-method.test.ts.
test('undo() called from a consumer module is refused at build time', async () => {
	await expect(import('./scenarios/method.tsrx')).rejects.toThrow();
	// The dev server paints the refusal over the tester page, outside the iframe
	// cleanup() owns; left up it swallows every later real gesture in the lane.
	await expect.poll(() => clearDevServerErrorOverlay()).toBeGreaterThan(0);
});
