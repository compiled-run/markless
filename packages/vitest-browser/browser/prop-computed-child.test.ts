import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import App from './fixtures/prop-computed-child.tsrx';

// Defect 100. A child whose computed() derives from a live graph-bound prop
// installs the composed-symbol emission, and the prerender evaluator used to
// die on it with
// `TypeError: Cannot read properties of undefined (reading 'read')`
// before a single element reached the DOM. No behavior is involved: this is the
// plainest possible parent-writes / child-derives shape.
afterEach(() => cleanup());

function requireElement<T extends Element>(container: ParentNode, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return element;
}

test('CSR: a child computed() over a live prop renders, and a parent write refreshes it', async () => {
	const screen = await render(App);
	const container = screen.container as HTMLElement;

	await expect
		.poll(() => requireElement(container, 'span[data-child-derived]').textContent)
		.toBe('row!');

	requireElement<HTMLButtonElement>(container, 'button[data-relabel]').click();
	await expect
		.poll(() => requireElement(container, 'span[data-child-derived]').textContent)
		.toBe('moved!');
});

test('SSR resume: the served derived text is right, and it refreshes after the wake', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	expect(requireElement(container, 'span[data-child-derived]').textContent).toBe('row!');

	requireElement<HTMLButtonElement>(container, 'button[data-relabel]').click();
	await expect
		.poll(() => requireElement(container, 'span[data-child-derived]').textContent)
		.toBe('moved!');
});
