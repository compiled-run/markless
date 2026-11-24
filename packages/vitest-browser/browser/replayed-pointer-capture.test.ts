import { afterEach, expect, test } from 'vitest';
import {
	marklessCapturedInput,
	marklessRunAtCurrentTarget,
	POINTER_CAPTURE_PROPERTY,
} from '../../web/src/event-current-target.ts';

// A handler whose code loaded after the browser finished dispatching its press runs on an event whose pointer may
// already have lifted: the capture it takes still decides where that pointer's later events go.

let root: HTMLElement;
afterEach(() => root?.remove());

function page() {
	root = document.createElement('div');
	root.innerHTML = '<div data-knob><span data-face></span></div><div data-field></div>';
	document.body.append(root);
	return {
		knob: root.querySelector('[data-knob]')!,
		face: root.querySelector('[data-face]')!,
		field: root.querySelector('[data-field]')!,
	};
}

// Dispatched and over, as an event the boot forwarded is once its handler's code arrives; each a clock tick after the last.
async function sent(type: string, target: Element, pointerId = 41): Promise<PointerEvent> {
	await new Promise((done) => setTimeout(done, 2));
	const event = new PointerEvent(type, { pointerId, bubbles: true });
	target.dispatchEvent(event);
	return event;
}

test('a capture a replayed press takes holds although its pointer is gone, and aims the moves and release sent before it', async () => {
	const { knob, face, field } = page();
	const down = await sent('pointerdown', face);
	const move = await sent('pointermove', field);
	const up = await sent('pointerup', field);
	const after = await sent('pointermove', field);
	expect(down.eventPhase).toBe(0);
	marklessRunAtCurrentTarget(down, knob, () => {
		expect(() => knob.setPointerCapture(41)).not.toThrow();
		expect(knob.hasPointerCapture(41)).toBe(true);
	}, undefined);
	expect(() => knob.setPointerCapture(41)).toThrow();
	expect(Reflect.get(globalThis, POINTER_CAPTURE_PROPERTY)).toBe(marklessCapturedInput);

	const aimed = marklessCapturedInput({ root, event: move, element: field, eventIndex: 3 });
	expect(move.target).toBe(knob);
	expect(aimed).toMatchObject({ element: knob, eventRecord: null, eventIndex: undefined });
	marklessCapturedInput({ root, event: up, element: field });
	expect(up.target).toBe(knob);
	marklessRunAtCurrentTarget(up, knob, () => expect(knob.hasPointerCapture(41)).toBe(true), undefined);

	// Sent after the release: no capture holds it.
	const input = { root, event: after, element: field };
	expect(marklessCapturedInput(input)).toBe(input);
	expect(after.target).toBe(field);
});

test('a release in a replayed handler ends the capture there, and another pointer or a key is left as it came', async () => {
	const { knob, face, field } = page();
	const down = await sent('pointerdown', face, 42);
	const first = await sent('pointermove', field, 42);
	const released = await sent('pointermove', field, 42);
	const other = await sent('pointermove', field, 43);
	const key = new KeyboardEvent('keydown', { key: 'a' });
	field.dispatchEvent(key);
	marklessRunAtCurrentTarget(down, knob, () => knob.setPointerCapture(42), undefined);
	marklessCapturedInput({ root, event: first });
	marklessRunAtCurrentTarget(first, knob, () => knob.releasePointerCapture(42), undefined);
	for (const event of [released, other, key]) {
		const input = { root, event };
		expect(marklessCapturedInput(input)).toBe(input);
		expect(event.target).toBe(field);
	}
	expect(first.target).toBe(knob);
});

test('a handler on a live event, or on one with no pointer, takes the native capture calls', () => {
	const { knob } = page();
	const native = Element.prototype.setPointerCapture;
	let seen: unknown;
	knob.addEventListener('pointerdown', (event) => {
		marklessRunAtCurrentTarget(event, knob, () => (seen = Element.prototype.setPointerCapture), undefined);
	});
	knob.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 44 }));
	expect(seen).toBe(native);
	const click = new MouseEvent('click');
	knob.dispatchEvent(click);
	marklessRunAtCurrentTarget(click, knob, () => (seen = Element.prototype.setPointerCapture), undefined);
	expect(seen).toBe(native);
});
