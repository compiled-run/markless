import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Aspect from './scenarios/aspect.tsrx';
import Basic from './scenarios/basic.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Form from './scenarios/form.tsrx';

// Rows assert the facts an announcement must convey — role, name, description —
// never a reader product's wording.
const sr = virtualDriver;

// The one word this family needs that the shared vocabulary has no slot for: the
// handles are sliders, and a reader says so around a number it also speaks.
const SLIDER = 'slider';

async function open(component: Parameters<typeof render>[0]) {
	const { container } = await render(component);
	await sr.start(container as unknown as HTMLElement);
}

afterEach(async () => {
	await sr.stop().catch(() => {});
});

function expectConveys(phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).toEqual([]);
}

/** Walk the widget and hand back every announcement. */
async function lap(steps: number): Promise<string[]> {
	const seen: string[] = [await sr.lastSpokenPhrase()];
	for (let step = 0; step < steps; step++) {
		await sr.next();
		seen.push(await sr.lastSpokenPhrase());
	}
	return seen;
}

/** The first announcement in a walk that carries a fact, or a failure naming what was heard. */
async function phraseWith(fact: string, steps = 18): Promise<string> {
	const seen = await lap(steps);
	const found = seen.find((line) => line.includes(fact));
	if (!found) throw new Error(`${sr.name} never announced "${fact}": ${JSON.stringify(seen)}`);
	return found;
}

function selection(): HTMLElement {
	const found = document.querySelector<HTMLElement>('[data-testid="selection"]');
	if (!found) throw new Error('Expected the crop rectangle.');
	return found;
}

function readout(): Element {
	const found = document.querySelector('output[aria-live]');
	if (!found) throw new Error('Expected the live rect readout.');
	return found;
}

function press(target: Element, key: string, modifiers: { shift?: boolean } = {}) {
	target.dispatchEvent(
		new KeyboardEvent('keydown', {
			key,
			bubbles: true,
			cancelable: true,
			shiftKey: modifiers.shift === true,
		}),
	);
}

// The family's central reader decision in one row: there is no APG pattern for a
// movable rectangle, so it ships as a named group that says what kind of group it
// is, and everything else hangs off that.
test('the rectangle is announced as a named group that says what kind of group it is', async () => {
	await open(Basic);
	// `aria-roledescription` is spoken in place of the role word, which is the
	// whole point of it: there is no APG role for a movable rectangle.
	const phrase = await phraseWith('crop area');
	expectConveys(phrase, { name: 'Crop' });
	expect(selection().getAttribute('role')).toBe('group');
	expect(selection().getAttribute('aria-roledescription')).toBe('crop area');
});

test('the description and the live rect are what the rectangle is described by', async () => {
	await open(Basic);
	const described = (selection().getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
	const spoken = described.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
	expect(spoken).toContain('Drag the rectangle, or arrow it around.');
	// Where the rectangle is, on arrival rather than only on change: without this
	// a reader is told nothing at all about a thing whose whole state is a
	// position and a size.
	expect(spoken).toContain('40, 30, 200×150');
});

test('a move is spoken, because nothing else would say the rectangle had moved', async () => {
	await open(Basic);
	const live = readout();
	expect(live.getAttribute('aria-live')).toBe('polite');
	expect(live.textContent).toBe('40, 30, 200×150');

	press(selection(), 'ArrowRight', { shift: true });
	await expect.poll(() => live.textContent).toBe('50, 30, 200×150');
	press(selection(), 'ArrowDown', { shift: true });
	await expect.poll(() => live.textContent).toBe('50, 40, 200×150');
});

// The divergence this lane exists to settle: every reference renders its handles
// as buttons, which throws the value away. Ours are sliders with a value.
test('each handle is announced as a slider carrying its edge', async () => {
	await open(Basic);
	const spoken = await lap(18);
	const sliders = spoken.filter((line) => line.toLowerCase().includes(SLIDER));
	expect(sliders.length).toBeGreaterThan(0);
	// The inline-end handle sits at 240, and a reader speaks the number.
	expect(spoken.some((line) => line.includes('240'))).toBe(true);
});

test('every handle has a name of its own rather than the crop name eight times', async () => {
	await open(Basic);
	const handles = Array.from(document.querySelectorAll('[ui-handle]'));
	expect(handles.length).toBe(8);
	const names = handles.map((found) => found.getAttribute('aria-label'));
	expect(new Set(names).size).toBe(8);
	for (const found of handles) {
		expect(found.getAttribute('role')).toBe(SLIDER);
		expect(found.getAttribute('aria-valuenow')).toBeTruthy();
	}
});

test('a corner speaks both of its coordinates, because ARIA gives a slider one value', async () => {
	await open(Basic);
	const corner = document.querySelector('[ui-handle][ui-block-start][ui-inline-start]');
	expect(corner?.getAttribute('aria-valuetext')).toBe('40, 30');
	// An edge handle has one coordinate and needs no override.
	const edge = document.querySelector('[ui-handle][ui-inline-end]:not([ui-block-start])');
	expect(edge?.hasAttribute('aria-valuetext')).toBe(false);
});

test('the grid inside the rectangle is decoration and is never a stop', async () => {
	await open(Aspect);
	const grid = document.querySelector('[data-testid="indicator"]');
	expect(grid?.getAttribute('aria-hidden')).toBe('true');
	expect(grid?.hasAttribute('role')).toBe(false);
});

test('a validation message is part of what the rectangle is described by', async () => {
	await open(Form);
	const described = (selection().getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
	const first = document.getElementById(described[0]);
	expect(first?.textContent).toBe('Pick a crop before sending.');
	expect(described.map((id) => document.getElementById(id)?.textContent ?? '').join(' ')).toContain(
		'Pick the part to keep.',
	);
});

test('a disabled crop is out of the tab order and still named', async () => {
	await open(Disabled);
	expect(selection().getAttribute('tabindex')).toBe('-1');
	expect(selection().getAttribute('aria-disabled')).toBe('true');
	const phrase = await phraseWith('crop area');
	expectConveys(phrase, { name: 'Crop' });
});

test('the field is never met, so what it carries is not a reader stop', async () => {
	await open(Form);
	const field = document.querySelector('[data-testid="field"]');
	expect(field?.getAttribute('aria-hidden')).toBe('true');
	expect(field?.getAttribute('tabindex')).toBe('-1');
});
