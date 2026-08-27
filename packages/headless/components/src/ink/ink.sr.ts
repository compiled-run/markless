import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Buttons from './scenarios/buttons.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Form from './scenarios/form.tsrx';
import Readonly from './scenarios/readonly.tsrx';
import Signature from './scenarios/signature.tsrx';

// Rows assert the facts an announcement must convey — role, name, description —
// never a reader product's wording.
const sr = virtualDriver;

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

/** Walk the whole widget once and hand back every announcement. */
async function lap(steps: number): Promise<string[]> {
	const seen: string[] = [await sr.lastSpokenPhrase()];
	for (let step = 0; step < steps; step++) {
		await sr.next();
		seen.push(await sr.lastSpokenPhrase());
	}
	return seen;
}

function surface(): SVGSVGElement {
	const found = document.querySelector<SVGSVGElement>('[data-testid="area"]');
	if (!found) throw new Error('Expected the drawing area.');
	return found;
}

function drawStroke(from = 20) {
	const area = surface();
	const box = area.getBoundingClientRect();
	const emit = (type: string, x: number, y: number) =>
		area.dispatchEvent(
			new PointerEvent(type, {
				bubbles: true,
				cancelable: true,
				button: 0,
				buttons: type === 'pointerup' ? 0 : 1,
				clientX: x,
				clientY: y,
				pressure: 0.5,
				pointerType: 'mouse',
				pointerId: 1,
				isPrimary: true,
			}),
		);
	emit('pointerdown', box.left + from, box.top + 20);
	for (let step = 1; step <= 12; step++) {
		emit('pointermove', box.left + from + step * 8, box.top + 20 + step * 5);
	}
	emit('pointerup', box.left + from + 96, box.top + 80);
}

// The whole family's reader problem in one row: a drawing has no text, so the
// surface is one image carrying the consumer's label and nothing else.
test('the surface is announced as an image named by the label', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'image' }), { role: 'image', name: 'Drawing' });
});

test('the description and the stroke count are what the image is described by', async () => {
	await open(Basic);
	const area = surface();
	const described = (area.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
	const spoken = described
		.map((id) => document.getElementById(id)?.textContent ?? '')
		.join(' ');
	expect(spoken).toContain('Draw with a mouse, pen or finger.');
	// An empty drawing says so: without this a reader is told nothing at all about
	// whether anything is on the surface.
	expect(spoken).toContain('Empty');
});

test('a stroke that lands is spoken, because nothing else would say it had', async () => {
	await open(Basic);
	const live = document.querySelector('output[aria-live]');
	expect(live?.getAttribute('aria-live')).toBe('polite');
	expect(live?.textContent).toBe('Empty');

	drawStroke();
	await expect.poll(() => live?.textContent).toBe('1 stroke');
	drawStroke(140);
	await expect.poll(() => live?.textContent).toBe('2 strokes');
});

test('nothing inside the surface is reachable, so the guide is never a stop', async () => {
	await open(Signature);
	const guide = document.querySelector('[data-testid="indicator"]');
	// The guide and every stroke sit inside `role="img"`, which makes them
	// presentational, and the guide is `aria-hidden` on top of that.
	expect(guide?.getAttribute('aria-hidden')).toBe('true');
	expect(guide?.hasAttribute('role')).toBe(false);

	await readUntil(sr, { role: 'image', name: 'Signature' });
	const graphics = (await lap(4)).filter(
		(phrase) => missingFacts(sr, phrase, { role: 'image' }).length === 0,
	);
	// One graphic on the page, not one per thing drawn on it.
	expect(graphics.length).toBeLessThanOrEqual(1);
});

test('the buttons a consumer composes are announced as buttons', async () => {
	await open(Buttons);
	expectConveys(await readUntil(sr, { role: 'button', name: 'Undo' }), {
		role: 'button',
		name: 'Undo',
	});
	expectConveys(await readUntil(sr, { role: 'button', name: 'Clear' }), {
		role: 'button',
		name: 'Clear',
	});
});

// The field is `aria-hidden` and out of the tab order, so a reader never meets
// it. What is wrong therefore has to arrive as part of the surface's own
// description, which is why `ink.error` is named before `ink.description` there.
test('a validation message is part of what the surface is described by', async () => {
	await open(Form);
	const area = surface();
	const described = (area.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
	const first = document.getElementById(described[0]);
	expect(first?.textContent).toBe('Draw something before sending.');
	expect(
		described.map((id) => document.getElementById(id)?.textContent ?? '').join(' '),
	).toContain('Draw something.');
});

test('a required drawing is still one image, with the requirement in the form', async () => {
	await open(Signature);
	expectConveys(await readUntil(sr, { role: 'image' }), { role: 'image', name: 'Signature' });
	// The typed name beside it is the text alternative, and it is a real textbox.
	expectConveys(await readUntil(sr, { role: 'textbox', name: 'Type your name' }), {
		role: 'textbox',
		name: 'Type your name',
	});
});

test('a readonly drawing reads as an image with its strokes counted', async () => {
	await open(Readonly);
	expectConveys(await readUntil(sr, { role: 'image' }), { role: 'image', name: 'Drawing' });
	const live = document.querySelector('output[aria-live]');
	expect(live?.textContent).toBe('1 stroke');
});

test('a disabled drawing is out of the tab order and still named', async () => {
	await open(Disabled);
	expect(surface().getAttribute('tabindex')).toBe('-1');
	expectConveys(await readUntil(sr, { role: 'image' }), { role: 'image', name: 'Drawing' });
});
