import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import App from './fixtures/behavior-composed.tsrx';

// The composition-shaped sibling of `behavior-page-scope.test.ts`. CSR
// activates authored behaviors BEFORE it demand-loads the runtime graph, so a
// behavior on a child component's element reaches its symbol through a
// graph-less activation context. Nothing about that pass may cost the child its
// live prop binding or its own dispatch.
//
// The composed-symbol adapter in `packages/web/src/fns/composition.ts` reads the
// same graph-less context; it is pinned directly in
// `packages/web/test/composed-behavior-graph.test.ts`, because the only shape
// that installs it - a child whose computed() derives from a graph-bound prop -
// cannot be rendered same-module at all (see that test's note).
afterEach(() => cleanup());

function requireElement<T extends Element>(container: ParentNode, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return element;
}

test('CSR: an attach behavior on a child component part runs, and the prop binding survives', async () => {
	const screen = await render(App);
	const container = screen.container as HTMLElement;

	await expect
		.poll(() => requireElement(container, 'button[data-child-part]').getAttribute('data-attached'))
		.toBe('child');
	expect(requireElement(container, 'button[data-child-part]').getAttribute('data-label')).toBe(
		'row',
	);

	// The behavior pass must not have cost the child its own dispatch.
	requireElement<HTMLButtonElement>(container, 'button[data-child-part]').click();
	await expect
		.poll(() => requireElement(container, 'button[data-child-part]').textContent)
		.toBe('1');

	// Nor the live prop its refresh.
	requireElement<HTMLButtonElement>(container, 'button[data-relabel]').click();
	await expect
		.poll(() => requireElement(container, 'button[data-child-part]').getAttribute('data-label'))
		.toBe('moved');
});

test('SSR resume: the child component behavior runs once its host is woken', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	// Served HTML carries no stamp: attach is browser work.
	expect(requireElement(container, 'button[data-child-part]').getAttribute('data-attached')).toBe(
		null,
	);

	requireElement<HTMLButtonElement>(container, 'button[data-child-part]').click();
	await expect
		.poll(() => requireElement(container, 'button[data-child-part]').textContent)
		.toBe('1');
	await expect
		.poll(() => requireElement(container, 'button[data-child-part]').getAttribute('data-attached'))
		.toBe('child');
});
