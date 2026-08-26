import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import BarePropPage from './bare-prop-page.tsrx';
import IndexedArrayPage from './indexed-array-page.tsrx';

// Gate 1. A tour cannot query for its target, so the family rests on a consumer
// minting an element() handle and handing it to a part. No scenario in this
// library had ever done that. Measured here: the handle is live in the module
// that minted it, and it is dropped on the way across a component edge.
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
	await expect.poll(() => spot.getAttribute('data-tg-probe')).toBe('undefined|object|save-step');
}

test('CSR: the minted handle is live in its own module, and a string prop crosses the edge', async () => {
	const screen = await render(BarePropPage);
	await expectTheControlsHold(screen.container as HTMLElement);
});

test('SSR resume: the same two controls hold after resume', async () => {
	const screen = await renderSSR(BarePropPage);
	await expectTheControlsHold(screen.container as HTMLElement);
});

// The part's own handle (`rootEl`, bound by its own markup) resolves; the
// consumer's, handed over as `target={target}`, does not. The emitted
// render-data shows why: the page's `view.elementHandles` records the handle
// against the page's own host node, and the component-edge slot for <Spot>
// carries no prop record for `target` at all - so the child's props object has
// no such key and the read is a plain `undefined`. Nothing is reported: the prop
// classifies as `kind: 'graph-reference'` with `graphBindingKind: 'element'`
// (collect-components.ts:325), and the only lowering that consumes that pairing
// resolves a handle a CHILD binds with `el=` back to the parent that minted it
// (resolvePropForwardedElementHandle, collect-elements.ts:967). Reading the
// handle as a value in the child's handler is not that shape, and no pass
// substitutes for it.
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

test.fails('CSR: a bare handle prop reaches the part as a DOM object', async () => {
	const screen = await render(BarePropPage);
	await expectTheHandleCrosses(screen.container as HTMLElement);
});

test.fails('SSR resume: a bare handle prop reaches the resumed handler', async () => {
	const screen = await renderSSR(BarePropPage);
	await expectTheHandleCrosses(screen.container as HTMLElement);
});

// Declaring the part in the SAME module as the consumer does not rescue it: the
// compiler refuses the page outright, and the diagnostic names the one shape it
// does support.
test('a part declared in the consumer module is refused, and the refusal names the supported shape', async () => {
	const { status, body } = await moduleStatus('./same-module-page.tsrx?import');
	expect(status).toBe(500);
	expect(body).toContain('MARKLESS_ELEMENT_HANDLE_PROP_UNSUPPORTED');
	expect(body).toContain(
		'this slice only supports element handles passed as direct component props, not through arrays or nested object props.',
	);
	expect(body).toContain('or bind it in the component that renders the host element.');
});

// The memo predicted the array-of-objects shape is refused. It is - but only
// when the handler reads the array as a whole. `steps.length` demands the opaque
// value and is refused; `steps[0]` is an indexed path the capture pass reduces,
// and that variant compiles.
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

test('the same array read one entry at a time compiles', async () => {
	const { status } = await moduleStatus('./indexed-array-page.tsrx?import');
	expect(status).toBe(200);
});

// ...and delivers nothing. The prop name is emitted into the handler's own
// module with nothing bound to it, so the first press is a ReferenceError - a
// build that passed turning into a runtime crash.
test('an indexed read of the array prop crashes the handler module', async () => {
	const seen: string[] = [];
	const onRejection = (event: PromiseRejectionEvent) => {
		seen.push(String((event.reason as Error)?.message ?? event.reason));
		event.preventDefault();
	};
	const onError = (event: ErrorEvent) => {
		seen.push(String(event.message));
		event.preventDefault();
	};
	window.addEventListener('unhandledrejection', onRejection);
	window.addEventListener('error', onError);
	try {
		const screen = await render(IndexedArrayPage);
		const list = (screen.container as HTMLElement).querySelector<HTMLElement>(
			'[data-tg-list-indexed]',
		);
		list?.click();
		await expect.poll(() => seen.join('\n')).toContain('steps is not defined');
		expect(list?.getAttribute('data-tg-probe')).toBeNull();
	} finally {
		window.removeEventListener('unhandledrejection', onRejection);
		window.removeEventListener('error', onError);
	}
});
