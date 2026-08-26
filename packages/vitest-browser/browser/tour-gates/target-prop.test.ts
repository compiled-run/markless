import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import BarePropPage from './bare-prop-page.tsrx';
import LayeredPage from './layered-page.tsrx';
import SteppingPage from './stepping-page.tsrx';

// Gate 1. A tour cannot query for its target, so the family rests on a consumer
// minting an element() handle and handing it to a part. The handle is a graph
// node with no value in the graph: the live element lives only in the page's
// handle registry, so a prop route that lands on one is answered there.
afterEach(() => cleanup());

async function moduleStatus(specifier: string) {
	const response = await fetch(new URL(specifier, import.meta.url));
	return { status: response.status, body: await response.text() };
}

function parts(container: ParentNode) {
	const target = container.querySelector<HTMLButtonElement>('[data-tg-target]');
	const spot = container.querySelector<HTMLElement>('[data-tg-spot]');
	const ownProbe = container.querySelector<HTMLButtonElement>('[data-tg-own-probe]');
	if (!target || !spot || !ownProbe) throw new Error('Expected the target, the spot and the probe.');
	return { target, spot, ownProbe };
}

// The two controls that fence the finding in: the handle is a live DOM object in
// the module that minted it, and an ordinary string prop crosses the same edge.
async function expectTheControlsHold(container: ParentNode) {
	const { target, spot, ownProbe } = parts(container);

	ownProbe.click();
	await expect.poll(() => target.getAttribute('data-tg-own-seen')).toBe('object');

	spot.click();
	await expect.poll(() => spot.getAttribute('data-tg-probe')).toBe('object|object|save-step');
}

test('CSR: the minted handle is live in its own module, and a string prop crosses the edge', async () => {
	const screen = await render(BarePropPage);
	await expectTheControlsHold(screen.container as HTMLElement);
});

test('SSR resume: the same two controls hold after resume', async () => {
	const screen = await renderSSR(BarePropPage);
	await expectTheControlsHold(screen.container as HTMLElement);
});

// The part's own handle (`rootEl`, bound by its own markup) resolves, and so
// does the consumer's, handed over as `target={target}`: the edge's route table
// carries `target -> element:target`, and the read that lands on a handle id is
// answered by the handle registry rather than by a graph read that has no DOM
// node to give. A method read off that path comes back bound to the element, so
// `target.setAttribute(...)` still acts on the button.
async function expectTheHandleCrosses(container: ParentNode) {
	const { target, spot } = parts(container);

	spot.click();

	await expect.poll(() => target.getAttribute('data-tg-seen')).toBe('yes');
	expect(spot.getAttribute('data-tg-kind')).toBe('element');
	expect(spot.getAttribute('data-tg-tag')).toBe('BUTTON');

	const box = target.getBoundingClientRect();
	expect(box.width).toBeGreaterThan(0);
	expect(spot.style.getPropertyValue('--width')).toBe(`${Math.round(box.width)}px`);
}

test('CSR: a bare handle prop reaches the part as a DOM object', async () => {
	const screen = await render(BarePropPage);
	await expectTheHandleCrosses(screen.container as HTMLElement);
});

test('SSR resume: a bare handle prop reaches the resumed handler', async () => {
	const screen = await renderSSR(BarePropPage);
	await expectTheHandleCrosses(screen.container as HTMLElement);
});

// The tour card sits inside the tour root: the part is projected through two
// components before the consumer's handle reaches it.
test('CSR: the handle crosses two projection layers', async () => {
	const screen = await render(LayeredPage);
	await expectTheHandleCrosses(screen.container as HTMLElement);
});

test('SSR resume: the handle crosses two projection layers', async () => {
	const screen = await renderSSR(LayeredPage);
	await expectTheHandleCrosses(screen.container as HTMLElement);
});

// Declaring the part in the SAME module as the consumer is still refused. Both
// resolvers that decide it - the handle-binding walk and the payload arena's
// handle records - look the name up module-wide, so the part's own destructured
// `target` prop answers for the page's handle and the page reads as a nested
// forward. The page's own `element:target` never reaches the served handle
// records either, which is why widening this shape needs the arena's resolution
// scoped, not just the walk's.
test('a part declared in the consumer module is refused, and the refusal names the supported shape', async () => {
	const { status, body } = await moduleStatus('./same-module-page.tsrx?import');
	expect(status).toBe(500);
	expect(body).toContain('MARKLESS_ELEMENT_HANDLE_PROP_UNSUPPORTED');
	expect(body).toContain(
		'this slice only supports element handles passed as direct component props, not through arrays or nested object props.',
	);
	expect(body).toContain('or bind it in the component that renders the host element.');
});

// The shape the refusal's text actually names: a handle reached through a nested
// object prop never resolves to one parent-owned handle the compiler can prove.
test('a handle reached through a nested object prop is refused too', async () => {
	const { status, body } = await moduleStatus('./nested-handle-page.tsrx?import');
	expect(status).toBe(500);
	expect(body).toContain('MARKLESS_ELEMENT_HANDLE_PROP_UNSUPPORTED');
	expect(body).toContain(
		'this slice only supports element handles passed as direct component props, not through arrays or nested object props.',
	);
	expect(body).toContain('or bind it in the component that renders the host element.');
});

// What the child reads is the element as it stands at dispatch, not the value
// its own render was handed: a parent write that moves the tour on is visible
// to the part's next read.
test('a parent write to the target is visible to the part that reads the handle', async () => {
	const screen = await render(SteppingPage);
	const container = screen.container as HTMLElement;
	const advance = container.querySelector<HTMLButtonElement>('[data-tg-advance]');
	const spot = container.querySelector<HTMLElement>('[data-tg-spot-step]');
	if (!advance || !spot) throw new Error('Expected the advance button and the step spot.');

	spot.click();
	await expect.poll(() => spot.getAttribute('data-tg-step-seen')).toBe('one');

	advance.click();
	await expect.poll(() => container.querySelector('[data-tg-target]')?.getAttribute('data-tg-step')).toBe('two');

	spot.click();
	await expect.poll(() => spot.getAttribute('data-tg-step-seen')).toBe('two');
});

// The memo predicted the array-of-objects shape is refused. It is - when the
// handler reads the array as a whole, `steps.length` demands the opaque value...
test('an array of objects carrying the handle is refused when the handler reads the array', async () => {
	const { status, body } = await moduleStatus('./steps-array-page.tsrx?import');
	expect(status).toBe(500);
	expect(body).toContain('MARKLESS_CAPTURE_OPAQUE_PROP');
	expect(body).toContain(
		'because prop \\"steps\\" for \\"SpotListWhole\\" is the runtime expression',
	);
	expect(body).toContain(
		'A demanded capture slot must route to a graph node, a compiler-known constant, or a callback symbol.',
	);
});

// ...and when it reads one entry at a time. `steps[0]` reduced to no route at
// all, so the prop name reached the browser unbound and the first press threw a
// ReferenceError. A build that passes and then crashes is refused instead.
test('the same array read one entry at a time is refused too', async () => {
	const { status, body } = await moduleStatus('./spot-indexed.tsrx?import');
	expect(status).toBe(500);
	expect(body).toContain('MARKLESS_CAPTURE_OPAQUE_PROP');
	expect(body).toContain(
		'because prop \\"steps\\" for \\"SpotListIndexed\\" is read through a path the compiler cannot reduce',
	);
	expect(body).toContain('would reach the browser unbound');
});
