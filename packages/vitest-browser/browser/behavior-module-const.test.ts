import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import App from './fixtures/behavior-module-const.tsrx';

// An `attach={...}` behavior that reads a module-scope declaration.
//
// The behavior runs in the browser, out of a module fetched on its own, so the
// `const` and the class instance it reads have to be in that module. They were
// not: the behavior emitter had no carry channel at all, so the names stayed
// free and attach threw a ReferenceError the first time it ran. The server never
// saw it — SSR renders from the authored module, where every declaration is in
// scope, so the served HTML was green and the crash waited for the browser.
// Both lanes are witnessed for that reason: the SSR lane is not a duplicate, it
// is the lane that stayed green while the bug shipped.
afterEach(() => cleanup());

function requireElement<T extends Element>(container: ParentNode, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return element;
}

async function expectStamped(container: ParentNode) {
	// These are the assertions the defect failed. Before the carry each factory
	// threw `ReferenceError: LABEL is not defined` (and `stamper is not
	// defined`), so no attribute was ever written.
	await expect
		.poll(() => requireElement(container, 'p[data-plain]').getAttribute('data-state'))
		.toBe('ready');
	await expect
		.poll(() => requireElement(container, 'p[data-via-class]').getAttribute('data-tone'))
		.toBe('ready');
	await expect
		.poll(() => requireElement(container, 'p[data-labelled]').getAttribute('data-label'))
		.toBe('state:ready');
}

test('CSR: an attach behavior reading a module-scope const stamps it on the element', async () => {
	const screen = await render(App);
	await expectStamped(screen.container as HTMLElement);
});

test('SSR resume: an attach behavior reading a module-scope const stamps it on the element', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	// The served HTML carries no stamp: attach is browser work, and the server
	// render that produced this markup never ran it.
	expect(requireElement(container, 'p[data-plain]').getAttribute('data-state')).toBe(null);

	// Resume is progressive — a behavior runs when its own host is woken — so
	// each witnessed host gets the gesture rather than one shared button.
	for (const selector of ['p[data-plain]', 'p[data-via-class]', 'p[data-labelled]']) {
		requireElement<HTMLParagraphElement>(container, selector).click();
	}
	await expect.poll(() => requireElement(container, 'output[data-taps]').textContent).toBe('3');

	await expectStamped(container);
});
