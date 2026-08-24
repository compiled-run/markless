import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ResumeDispatchOrder from './fixtures/resume-dispatch-order.tsrx';

afterEach(() => cleanup());

function requireElement<T extends Element>(container: HTMLElement, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return element;
}

// One keystroke fires three events with nothing between them, exactly as the
// browser delivers them. No await anywhere in the burst: the whole point is
// that the runtime, not the test, has to keep the handler bodies in order.
function typeThenBackspace(field: HTMLInputElement): void {
	field.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
	field.dispatchEvent(new Event('input', { bubbles: true }));
	field.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
	field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
	field.dispatchEvent(new Event('input', { bubbles: true }));
	field.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', bubbles: true }));
}

const BURST_TRAIL = 'down:a in:a up:a down:Backspace in: up:Backspace ';
// The interleave was a coin flip per gesture sequence, so one burst proves
// nothing: a single attempt passes by luck roughly half the time.
const BURSTS = 8;

const TRAIL_EVENT_TYPE: Record<string, string> = { down: 'keydown', in: 'input', up: 'keyup' };

function trailEventTypes(trail: HTMLOutputElement): string[] {
	return (trail.textContent ?? '')
		.split(' ')
		.filter((entry) => entry.length > 0)
		.map((entry) => TRAIL_EVENT_TYPE[entry.slice(0, entry.indexOf(':'))] ?? entry);
}

test('SSR: every resumed gesture runs through one dispatch queue, in arrival order', async () => {
	const screen = await renderSSR(ResumeDispatchOrder);
	const container = screen.container;
	const field = requireElement<HTMLInputElement>(container, 'input[data-field]');
	const trail = requireElement<HTMLOutputElement>(container, 'output[data-trail]');
	const root = container.querySelector('[data-async-container]') as HTMLElement & {
		__marklessDispatch?: (input: { readonly event?: Event }) => unknown;
	};
	if (!root) throw new Error('Expected a resumed container in the server-rendered DOM.');

	// Watching the queue entry point from outside: the page is plain SSR with no
	// async boundary, so before this defect was fixed nothing ever installed
	// __marklessDispatch here and the arrivals below stayed empty.
	const arrivals: string[] = [];
	let queued: ((input: { readonly event?: Event }) => unknown) | undefined;
	Object.defineProperty(root, '__marklessDispatch', {
		configurable: true,
		get: () =>
			queued &&
			((input: { readonly event?: Event }) => {
				arrivals.push(input.event?.type ?? 'none');
				return queued!(input);
			}),
		set: (next) => {
			queued = next;
		},
	});

	typeThenBackspace(field);
	await expect.poll(() => trailEventTypes(trail).length).toBe(6);

	// Six gestures, six queue arrivals: the plain page owns dispatch too.
	expect(arrivals).toHaveLength(6);
	// Every handler body ran to completion in the order its event reached the
	// queue. Unserialized, each body was its own async task and the bodies
	// reordered against their own arrivals.
	expect(trailEventTypes(trail)).toEqual(arrivals);
});

test('SSR: a resumed field keeps every keystroke in native order and ends empty', async () => {
	const screen = await renderSSR(ResumeDispatchOrder);
	const container = screen.container;
	const field = requireElement<HTMLInputElement>(container, 'input[data-field]');
	const trail = requireElement<HTMLOutputElement>(container, 'output[data-trail]');

	for (let burst = 0; burst < BURSTS; burst++) {
		const expected = BURST_TRAIL.repeat(burst + 1);
		typeThenBackspace(field);
		await expect.poll(() => trail.textContent).toBe(expected);
		// The stale-character echo: a deleting keydown that ran before the
		// appending one leaves `text` holding the character the user removed,
		// and the value binding writes it straight back into the live field.
		expect(field.value).toBe('');
	}
});

test('CSR: the same burst is ordered without a resume boundary', async () => {
	const screen = await render(ResumeDispatchOrder);
	const container = screen.container as HTMLElement;
	const field = requireElement<HTMLInputElement>(container, 'input[data-field]');
	const trail = requireElement<HTMLOutputElement>(container, 'output[data-trail]');

	for (let burst = 0; burst < BURSTS; burst++) {
		typeThenBackspace(field);
		await expect.poll(() => trail.textContent).toBe(BURST_TRAIL.repeat(burst + 1));
		expect(field.value).toBe('');
	}
});
